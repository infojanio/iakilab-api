"""Sign and verify a PDF using credentials mounted in the signing environment."""

import argparse
from datetime import datetime, timezone
import json
import sys
from pathlib import Path

from pyhanko.keys import load_cert_from_pemder
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign import signers
from pyhanko.sign.fields import SigSeedSubFilter
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.sign.validation.status import SignatureCoverageLevel
from pyhanko_certvalidator import ValidationContext


class SigningFailure(Exception):
    def __init__(self, exit_code):
        self.exit_code = exit_code


def verify(filename, trust_root, expected_certificate=None):
    context = ValidationContext(
        trust_roots=[load_cert_from_pemder(trust_root)], allow_fetching=False
    )
    with open(filename, "rb") as stream:
        signatures = PdfFileReader(stream).embedded_signatures
        if not signatures:
            raise SigningFailure(15)
        signature = signatures[-1]
        status = validate_pdf_signature(signature, signer_validation_context=context)
        if not status.bottom_line or status.coverage != SignatureCoverageLevel.ENTIRE_FILE:
            raise ValueError("PDF signature verification failed")
        if expected_certificate and signature.signer_cert.dump() != expected_certificate.dump():
            raise ValueError("Unexpected PDF signer")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["sign", "verify", "inspect"])
    parser.add_argument("input")
    parser.add_argument("trust_root")
    parser.add_argument("--output")
    parser.add_argument("--certificate")
    parser.add_argument("--password-file")
    parser.add_argument("--intermediate-chain")
    parser.add_argument("--reason")
    args = parser.parse_args()

    try:
        load_cert_from_pemder(args.trust_root)
        if args.mode != "verify":
            signer = signers.SimpleSigner.load_pkcs12(
                args.certificate,
                ca_chain_files=[args.intermediate_chain] if args.intermediate_chain else None,
                passphrase=Path(args.password_file).read_bytes().rstrip(b"\r\n"),
            )
            if signer is None:
                raise ValueError("Invalid PKCS#12")
    except Exception:
        raise SigningFailure(10) from None

    if args.mode == "verify":
        verify_output(args.input, args.trust_root)
        return

    certificate = signer.signing_cert
    valid_from = certificate.not_valid_before
    valid_until = certificate.not_valid_after
    if args.mode == "inspect":
        print(json.dumps({
            "validFrom": valid_from.isoformat(),
            "validUntil": valid_until.isoformat(),
        }))
        return

    now = datetime.now(timezone.utc)
    if now > valid_until:
        raise SigningFailure(11)
    if now < valid_from:
        raise SigningFailure(12)
    try:
        with open(args.input, "rb") as source, open(args.output, "xb") as target:
            signers.sign_pdf(
                IncrementalPdfFileWriter(source),
                signature_meta=signers.PdfSignatureMetadata(
                    field_name="IAkiLabSignature",
                    reason=args.reason,
                    subfilter=SigSeedSubFilter.PADES,
                ),
                signer=signer,
                output=target,
            )
    except Exception:
        raise SigningFailure(13) from None
    verify_output(args.output, args.trust_root, certificate)


def verify_output(filename, trust_root, expected_certificate=None):
    try:
        verify(filename, trust_root, expected_certificate)
    except SigningFailure:
        if expected_certificate is not None:
            raise SigningFailure(14) from None
        raise
    except Exception:
        raise SigningFailure(14) from None


if __name__ == "__main__":
    try:
        main()
    except SigningFailure as error:
        sys.exit(error.exit_code)

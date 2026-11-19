"""Sign and verify a PDF using credentials mounted in the signing environment."""

import argparse
from pathlib import Path

from pyhanko.keys import load_cert_from_pemder
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign import signers
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.sign.validation.status import SignatureCoverageLevel
from pyhanko_certvalidator import ValidationContext


def verify(filename, trust_root, expected_certificate=None):
    context = ValidationContext(
        trust_roots=[load_cert_from_pemder(trust_root)], allow_fetching=False
    )
    with open(filename, "rb") as stream:
        signatures = PdfFileReader(stream).embedded_signatures
        if not signatures:
            raise ValueError("PDF has no signature")
        signature = signatures[-1]
        status = validate_pdf_signature(signature, signer_validation_context=context)
        if not status.bottom_line or status.coverage != SignatureCoverageLevel.ENTIRE_FILE:
            raise ValueError("PDF signature verification failed")
        if expected_certificate and signature.signer_cert.dump() != expected_certificate.dump():
            raise ValueError("Unexpected PDF signer")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["sign", "verify"])
    parser.add_argument("input")
    parser.add_argument("trust_root")
    parser.add_argument("--output")
    parser.add_argument("--certificate")
    parser.add_argument("--password-file")
    args = parser.parse_args()

    if args.mode == "verify":
        verify(args.input, args.trust_root)
        return

    signer = signers.SimpleSigner.load_pkcs12(
        args.certificate, passphrase=Path(args.password_file).read_bytes().rstrip(b"\r\n")
    )
    if signer is None:
        raise ValueError("Unable to load signing credentials")
    with open(args.input, "rb") as source, open(args.output, "xb") as target:
        signers.sign_pdf(
            IncrementalPdfFileWriter(source),
            signature_meta=signers.PdfSignatureMetadata(field_name="IAkiLabSignature"),
            signer=signer,
            output=target,
        )
    verify(args.output, args.trust_root, signer.signing_cert)


if __name__ == "__main__":
    main()

"""Create synthetic A1 credentials in an empty, private test directory."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
import secrets
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12

output = Path(sys.argv[1])
output.mkdir(mode=0o700, exist_ok=True)
if any(output.iterdir()):
    raise SystemExit("Use an empty directory for synthetic fixtures.")
now = datetime.now(timezone.utc)


def key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def name(label):
    return x509.Name([x509.NameAttribute(x509.NameOID.COMMON_NAME, "TEST ONLY " + label)])


def certificate(label, private_key, issuer, issuer_key, start, end, is_ca=False):
    subject = name(label)
    return (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer or subject)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now + timedelta(days=start))
        .not_valid_after(now + timedelta(days=end))
        .add_extension(x509.BasicConstraints(ca=is_ca, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=not is_ca, content_commitment=not is_ca,
                key_encipherment=False, data_encipherment=False, key_agreement=False,
                key_cert_sign=is_ca, crl_sign=is_ca, encipher_only=None, decipher_only=None,
            ),
            critical=True,
        )
        .sign(issuer_key, hashes.SHA256())
    )


root_key = key()
root = certificate("Root", root_key, None, root_key, -120, 180, is_ca=True)
(output / "root.pem").write_bytes(root.public_bytes(serialization.Encoding.PEM))
wrong_key = key()
wrong = certificate("Wrong Root", wrong_key, None, wrong_key, -120, 180, is_ca=True)
(output / "wrong-root.pem").write_bytes(wrong.public_bytes(serialization.Encoding.PEM))
(output / "wrong-password").write_bytes(secrets.token_hex(24).encode())

for label, start, end in [
    ("valid", -1, 90), ("expiring", -1, 29), ("expired", -30, -1), ("future", 1, 90),
]:
    folder = output if label == "valid" else output / label
    folder.mkdir(mode=0o700, exist_ok=True)
    signer_key = key()
    signer = certificate(label, signer_key, root.subject, root_key, start, end)
    password = secrets.token_hex(24).encode()
    (folder / "password").write_bytes(password)
    (folder / "signer.p12").write_bytes(pkcs12.serialize_key_and_certificates(
        b"IAkiLab fixture", signer_key, signer, [root], serialization.BestAvailableEncryption(password),
    ))

#!/usr/bin/env python3
"""
serve_https.py - Khoi dong Web Server HTTPS cuc bo cho GHN Web App.
Cho phep dien thoai truy cap qua mang LAN va mo Live Camera quet ma QR/Barcode khong bi chan bao mat.
"""

import os
import sys
import ssl
import socket
import datetime
import ipaddress
from http.server import HTTPServer, SimpleHTTPRequestHandler

# Dam bao in tieng Viet UTF-8 tren Windows console
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

PORT = 3443
CERT_FILE = "cert.pem"
KEY_FILE = "key.pem"

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def ensure_ssl_cert():
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        return

    print("[INFO] Dang tao chung chi SSL tu ky (self-signed cert)...")
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    local_ip = get_local_ip()

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "VN"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "GHN Web App"),
        x509.NameAttribute(NameOID.COMMON_NAME, local_ip),
    ])

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.now(datetime.timezone.utc))
        .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=365))
        .add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
                x509.IPAddress(ipaddress.IPv4Address(local_ip)),
            ]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )

    with open(KEY_FILE, "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))

    with open(CERT_FILE, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    print("[SUCCESS] Da tao chung chi SSL cert.pem va key.pem thanh cong.")

def run():
    ensure_ssl_cert()
    local_ip = get_local_ip()
    
    server_address = ('0.0.0.0', PORT)
    httpd = HTTPServer(server_address, SimpleHTTPRequestHandler)

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

    print("\n" + "=" * 64)
    print(">> GHN HTTPS SERVER DANG CHAY (BAO MAT & MO TOAN QUYEN CAMERA) <<")
    print("=" * 64)
    print("Tren dien thoai (ket noi cung mang WiFi), mo trinh duyet vao:")
    print(f"   👉 https://{local_ip}:{PORT}/ghn_mobile.html")
    print("-" * 64)
    print("Tren may tinh:")
    print(f"   👉 https://localhost:{PORT}/index.html")
    print("=" * 64)
    print("Luu y khi mo tren dien thoai:")
    print("   1. Trinh duyet bao 'Ket noi khong an toan' do chung chi noi bo.")
    print("   2. Bam 'Nang cao' (Advanced) -> Chon 'Tiep tuc truy cap' (Proceed).")
    print("   3. Sau do trinh duyet se cap quyen LIVE CAMERA truc tiep 100%!")
    print("=" * 64 + "\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nDa dung HTTPS server.")
        sys.exit(0)

if __name__ == "__main__":
    run()

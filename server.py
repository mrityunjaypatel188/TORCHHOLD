#!/usr/bin/env python3
"""
Development Server for Touch & Hold Flashlight Web App.
Features:
- Standard HTTP on localhost:8000
- Auto LAN IP detection & QR Code display for instant mobile phone scanning
- Optional HTTPS mode with self-signed SSL/TLS certificate for testing camera permissions on phone over LAN
- Development caching headers and complete MIME type definitions
"""

import sys
import os
import ssl
import socket
import argparse
from http.server import HTTPServer, SimpleHTTPRequestHandler
import datetime
import ipaddress

# Ensure terminal output doesn't crash on Windows cp1252 code pages
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Ensure current working directory is the flashlight project directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)

class FlashlightHTTPHandler(SimpleHTTPRequestHandler):
    """Custom request handler with accurate MIME types and dev cache headers."""

    extensions_map = SimpleHTTPRequestHandler.extensions_map.copy()
    extensions_map.update({
        '.webmanifest': 'application/manifest+json',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.ico': 'image/x-icon',
        '.png': 'image/png',
    })

    def end_headers(self):
        # Prevent aggressive browser caching during active development
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        # Permissions policy allowing camera
        self.send_header('Permissions-Policy', 'camera=(self)')
        super().end_headers()

    def log_message(self, format, *args):
        # Formatted log with timestamp
        sys.stderr.write(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {args[0]} - {args[1]}\n")


def get_local_ip():
    """Detects active LAN IP address for mobile phone testing."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip


def generate_self_signed_cert(cert_file='cert.pem', key_file='key.pem', ip_addr=None):
    """Generates a self-signed SSL certificate using the cryptography library."""
    if os.path.exists(cert_file) and os.path.exists(key_file):
        return cert_file, key_file

    print("[*] Generating self-signed SSL certificate for HTTPS testing on mobile...")
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization

        # Generate private key
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

        # Subject & Issuer
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Flashlight Dev"),
            x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
        ])

        # SAN (Subject Alternative Names) for localhost and LAN IP
        san_entries = [
            x509.DNSName("localhost"),
            x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
        ]
        if ip_addr and ip_addr != '127.0.0.1':
            san_entries.append(x509.IPAddress(ipaddress.ip_address(ip_addr)))

        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.datetime.now(datetime.timezone.utc))
            .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=365))
            .add_extension(x509.SubjectAlternativeName(san_entries), critical=False)
            .sign(key, hashes.SHA256())
        )

        with open(key_file, "wb") as f:
            f.write(key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            ))

        with open(cert_file, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))

        print(f"[+] Created {cert_file} and {key_file} successfully.")
        return cert_file, key_file
    except ImportError:
        print("[!] Note: 'cryptography' package not found. Run: pip install -r requirements.txt")
        return None, None


def print_qr_code(url):
    """Prints an ASCII QR code to the terminal for easy scanning on phone."""
    try:
        import qrcode
        qr = qrcode.QRCode(border=1)
        qr.add_data(url)
        qr.make(fit=True)
        print("\nScan this QR code with your phone camera to open instantly:")
        qr.print_ascii(invert=True)
    except Exception:
        pass


import threading

def run_dual_server(http_port, https_port, lan_ip, no_qr):
    """Runs HTTP on http_port and HTTPS on https_port simultaneously."""
    # Setup HTTP Server
    http_addr = ('0.0.0.0', http_port)
    httpd = HTTPServer(http_addr, FlashlightHTTPHandler)
    http_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    http_thread.start()

    # Setup HTTPS Server
    cert_file, key_file = generate_self_signed_cert(ip_addr=lan_ip)
    https_enabled = False
    httpsd = None

    if cert_file and key_file:
        try:
            https_addr = ('0.0.0.0', https_port)
            httpsd = HTTPServer(https_addr, FlashlightHTTPHandler)
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(certfile=cert_file, keyfile=key_file)
            httpsd.socket = context.wrap_socket(httpsd.socket, server_side=True)
            https_enabled = True
        except Exception as e:
            print(f"[!] Warning: Could not bind HTTPS on port {https_port}: {e}")

    http_local = f"http://localhost:{http_port}"
    http_lan = f"http://{lan_ip}:{http_port}"
    https_lan = f"https://{lan_ip}:{https_port}" if https_enabled else None

    print("=" * 66)
    print("  [*] TOUCH & HOLD FLASHLIGHT - DUAL DEVELOPMENT SERVER")
    print("=" * 66)
    print(f"  Local PC URL (HTTP):    {http_local}")
    print(f"  Mobile LAN (HTTP):      {http_lan}")
    if https_enabled:
        print(f"  Mobile LAN (HTTPS):     {https_lan}  <-- [RECOMMENDED FOR TORCH]")
    print("=" * 66)

    # Print QR Code for HTTPS (preferred) or HTTP
    target_qr_url = https_lan if https_enabled else http_lan
    if not no_qr and target_qr_url:
        print_qr_code(target_qr_url)

    print("\n[i] Device Testing Instructions for Real Hardware Flashlight:")
    if https_enabled:
        print(f"  * Mobile Phone (Fastest): Open {https_lan}")
        print("    1. Chrome will show 'Connection is not private' (due to self-signed cert).")
        print("    2. Tap 'Advanced' -> Tap 'Proceed to ... (unsafe)'.")
        print("    3. Camera/Torch permission will now work natively!\n")
    print(f"  * Alternative (No Cert Warning): Open {http_lan}")
    print("    1. In Chrome on phone, visit: chrome://flags/#unsafely-treat-insecure-origin-as-secure")
    print(f"    2. Add: {http_lan} -> Set to 'Enabled' -> Tap 'Relaunch'.")
    print("  * Press Ctrl + C to stop the server.\n")

    try:
        if httpsd:
            httpsd.serve_forever()
        else:
            http_thread.join()
    except KeyboardInterrupt:
        print("\n[*] Stopping servers...")
        if httpsd:
            httpsd.shutdown()
        httpd.shutdown()
        print("[*] Servers stopped.")


def main():
    parser = argparse.ArgumentParser(description="Touch & Hold Flashlight Dev Server")
    parser.add_argument("--port", type=int, default=8000, help="HTTP port (default: 8000)")
    parser.add_argument("--https-port", type=int, default=8443, help="HTTPS port (default: 8443)")
    parser.add_argument("--no-qr", action="store_true", help="Disable terminal QR code display")
    args = parser.parse_args()

    lan_ip = get_local_ip()
    run_dual_server(args.port, args.https_port, lan_ip, args.no_qr)


if __name__ == '__main__':
    main()


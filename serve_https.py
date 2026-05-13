import http.server
import ssl
import os

# 1. Generate a self-signed certificate if it doesn't exist
if not os.path.exists("cert.pem"):
    print("Generating self-signed certificate...")
    os.system("openssl req -new -x509 -keyout key.pem -out cert.pem -days 365 -nodes -subj '/CN=localhost'")

# 2. Setup the HTTPS server
port = 8443
server_address = ('0.0.0.0', port)
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

# 3. Apply modern SSLContext wrapper (Fix for Python 3.12+)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile="cert.pem", keyfile="key.pem")
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print(f"🚀 HTTPS Server running at https://0.0.0.0:{port}")
print("Note: Your phone will show a 'Privacy Warning'. Click Advanced -> Proceed.")
httpd.serve_forever()

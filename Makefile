.PHONY: install clean

# install: ssl/test.crt
# 	@echo "Installing self-signed certificate into your System keychain."
# 	sudo security add-trusted-cert \
# 		-d -r trustRoot \
# 		-k /Library/Keychains/System.keychain \
# 		ssl/test.crt

ssl/localhost.crt: ssl/localhost.csr ssl/localhost.key ssl/openssl.conf
	openssl x509 \
		-req \
		-days 3650 \
		-in ssl/localhost.csr \
		-signkey ssl/localhost.key \
		-out ssl/localhost.crt \
		-extensions v3_req \
		-extfile ssl/openssl.conf

ssl/localhost.csr: ssl/localhost.key ssl/openssl.conf
	openssl req \
		-new \
		-out ssl/localhost.csr \
		-key ssl/localhost.key \
		-config ssl/openssl.conf \
		-subj "/C=US/ST=California/L=San Francisco/OU=Observable, Inc./CN=127.0.0.1"

ssl/localhost.key:
	openssl genrsa \
		-out ssl/localhost.key 2048

clean:
	rm ssl/localhost.*

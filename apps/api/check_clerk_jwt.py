import jwt
from jwt import PyJWKClient

JWT = input("Paste a fresh Clerk JWT: ").strip()

jwks_url = "https://darling-mayfly-5932.clerk.accounts.dev/.well-known/jwks.json"
client = PyJWKClient(jwks_url)

signing_key = client.get_signing_key_from_jwt(JWT)
print("Resolved key kid:", signing_key.key_id)

issuer = "https://darling-mayfly-5932.clerk.accounts.dev"
claims = jwt.decode(
    JWT,
    signing_key.key,
    algorithms=["RS256"],
    issuer=issuer,
    options={"verify_aud": False},
)
print("Verified!")
print(claims)

from cryptography.fernet import Fernet
from app.core.config import settings
from pwdlib import PasswordHash


""" 
Chiffrement des variables sensibles de l'application
"""

key = settings.ENCRYPTION_KEY.encode()  # Convert the key to bytes
my_fernet = Fernet(key)

def encrypt_data(data: str) -> str:
    encrypted_data = my_fernet.encrypt(data.encode())
    return encrypted_data.decode()  # Convert bytes back to string

def decrypt_data(encrypted_data: str) -> str:
    decrypted_data = my_fernet.decrypt(encrypted_data.encode())
    return decrypted_data.decode()  

""" 
    Hash de password pour authentification
"""

# instancer de 'hasher' avec une config recommandee
password_hash = PasswordHash.recommended()

def hash_password(password: str) -> str:
    return password_hash.hash(password)

def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)
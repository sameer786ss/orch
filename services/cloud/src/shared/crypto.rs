use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine as _;
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM, NONCE_LEN};
use ring::rand::{SecureRandom, SystemRandom};

pub fn parse_key(encoded: &str) -> [u8; 32] {
    let bytes = STANDARD
        .decode(encoded.trim())
        .expect("GITHUB_TOKEN_KEY must be valid base64");
    bytes
        .try_into()
        .expect("GITHUB_TOKEN_KEY must decode to 32 bytes")
}

pub fn random_token_url_safe(num_bytes: usize) -> Result<String, String> {
    let mut buf = vec![0u8; num_bytes];
    SystemRandom::new()
        .fill(&mut buf)
        .map_err(|_| "random generator failed".to_string())?;
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

pub fn seal_token(key: &[u8; 32], aad: &str, plaintext: &str) -> Result<String, String> {
    let unbound = UnboundKey::new(&AES_256_GCM, key).map_err(|_| "invalid encryption key".to_string())?;
    let sealing_key = LessSafeKey::new(unbound);
    let mut nonce_bytes = [0u8; NONCE_LEN];
    SystemRandom::new()
        .fill(&mut nonce_bytes)
        .map_err(|_| "random generator failed".to_string())?;
    let mut buffer = plaintext.as_bytes().to_vec();
    sealing_key
        .seal_in_place_append_tag(
            Nonce::assume_unique_for_key(nonce_bytes),
            Aad::from(aad.as_bytes()),
            &mut buffer,
        )
        .map_err(|_| "token encryption failed".to_string())?;
    let mut out = Vec::with_capacity(NONCE_LEN + buffer.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&buffer);
    Ok(STANDARD.encode(out))
}

pub fn open_token(key: &[u8; 32], aad: &str, ciphertext_b64: &str) -> Result<String, String> {
    let raw = STANDARD
        .decode(ciphertext_b64.trim())
        .map_err(|_| "stored token is malformed".to_string())?;
    if raw.len() < NONCE_LEN {
        return Err("stored token is truncated".to_string());
    }
    let (nonce_bytes, rest) = raw.split_at(NONCE_LEN);
    let nonce = Nonce::try_assume_unique_for_key(nonce_bytes)
        .map_err(|_| "stored token nonce is invalid".to_string())?;
    let unbound = UnboundKey::new(&AES_256_GCM, key).map_err(|_| "invalid encryption key".to_string())?;
    let opening_key = LessSafeKey::new(unbound);
    let mut buffer = rest.to_vec();
    let decrypted = opening_key
        .open_in_place(nonce, Aad::from(aad.as_bytes()), &mut buffer)
        .map_err(|_| "token decryption failed".to_string())?;
    String::from_utf8(decrypted.to_vec()).map_err(|_| "decrypted token is not UTF-8".to_string())
}

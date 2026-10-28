package in.foodapp.identity.infra.jwt;

import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/** Parses PEM text (PKCS8 private, X.509 SubjectPublicKeyInfo public). Literal backslash-n escapes are allowed. */
public final class PemUtils {

    private PemUtils() {
    }

    public static String normalise(String pem) {
        return pem.trim().replace("\\r", "").replace("\\n", "\n").replace("\r", "");
    }

    private static byte[] body(String pem, String expectedLabel) {
        String text = normalise(pem);
        if (text.contains("BEGIN RSA PRIVATE KEY")) {
            throw new IllegalArgumentException("PKCS#1 'RSA PRIVATE KEY' is not supported; convert to PKCS#8");
        }
        String stripped = text
                .replace("-----BEGIN " + expectedLabel + "-----", "")
                .replace("-----END " + expectedLabel + "-----", "")
                .replaceAll("\\s", "");
        if (stripped.contains("-----")) {
            throw new IllegalArgumentException("Unexpected PEM label; expected " + expectedLabel);
        }
        return Base64.getDecoder().decode(stripped);
    }

    public static RSAPrivateKey parsePrivateKey(String pem) {
        try {
            byte[] der = body(pem, "PRIVATE KEY");
            return (RSAPrivateKey) KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der));
        } catch (GeneralSecurityException | IllegalArgumentException | ClassCastException e) {
            throw new IllegalStateException("Invalid JWT_PRIVATE_KEY_PEM: " + e.getMessage(), e);
        }
    }

    public static RSAPublicKey parsePublicKey(String pem) {
        try {
            byte[] der = body(pem, "PUBLIC KEY");
            return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
        } catch (GeneralSecurityException | IllegalArgumentException | ClassCastException e) {
            throw new IllegalStateException("Invalid JWT_PUBLIC_KEY_PEM: " + e.getMessage(), e);
        }
    }

    public static RSAPublicKey derivePublicKey(RSAPrivateKey privateKey) {
        if (!(privateKey instanceof RSAPrivateCrtKey crt)) {
            throw new IllegalStateException("JWT_PUBLIC_KEY_PEM missing and cannot be derived from the private key");
        }
        try {
            return (RSAPublicKey) KeyFactory.getInstance("RSA")
                    .generatePublic(new RSAPublicKeySpec(crt.getModulus(), crt.getPublicExponent()));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}

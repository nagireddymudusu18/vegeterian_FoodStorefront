package in.foodapp.identity.infra.jwt;

import in.foodapp.identity.config.AppProperties;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.util.Base64;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

/** Holds the RSA key pair used to sign and verify access tokens. */
@Component
public class JwtKeys {

    private static final Logger log = LoggerFactory.getLogger(JwtKeys.class);

    private final RSAPrivateKey privateKey;
    private final RSAPublicKey publicKey;
    private final String keyId;

    @Autowired
    public JwtKeys(AppProperties props, Environment env) {
        boolean local = env.acceptsProfiles(Profiles.of("local"));
        String privPem = props.jwt().privateKeyPem();
        String pubPem = props.jwt().publicKeyPem();
        boolean hasPriv = privPem != null && !privPem.isBlank();
        boolean hasPub = pubPem != null && !pubPem.isBlank();

        if (hasPriv) {
            this.privateKey = PemUtils.parsePrivateKey(privPem);
            this.publicKey = hasPub ? PemUtils.parsePublicKey(pubPem) : PemUtils.derivePublicKey(this.privateKey);
        } else if (local) {
            log.warn("##########################################################################");
            log.warn("# JWT_PRIVATE_KEY_PEM not set: generating an EPHEMERAL in-memory RSA key  #");
            log.warn("# pair. Tokens become invalid on restart and other services cannot verify #");
            log.warn("# them. LOCAL DEVELOPMENT ONLY.                                           #");
            log.warn("##########################################################################");
            KeyPair kp = generate();
            this.privateKey = (RSAPrivateKey) kp.getPrivate();
            this.publicKey = (RSAPublicKey) kp.getPublic();
        } else {
            throw new IllegalStateException("JWT_PRIVATE_KEY_PEM (PKCS8) is required outside the local profile");
        }
        this.keyId = thumbprint(this.publicKey);
    }

    public JwtKeys(RSAPrivateKey privateKey, RSAPublicKey publicKey) {
        this.privateKey = privateKey;
        this.publicKey = publicKey;
        this.keyId = thumbprint(publicKey);
    }

    public static KeyPair generate() {
        try {
            KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
            gen.initialize(2048);
            return gen.generateKeyPair();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String thumbprint(RSAPublicKey key) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(key.getEncoded());
            return Base64.getUrlEncoder().withoutPadding().encodeToString(d).substring(0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public RSAPrivateKey privateKey() {
        return privateKey;
    }

    public RSAPublicKey publicKey() {
        return publicKey;
    }

    public String keyId() {
        return keyId;
    }
}

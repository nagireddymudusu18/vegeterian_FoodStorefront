package in.foodapp.identity.infra.crypto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

class ContactEventCipherTest {

    private static byte[] key(int fill) {
        byte[] k = new byte[32];
        Arrays.fill(k, (byte) fill);
        return k;
    }

    /** The wire format notification-service decodes: base64(IV[12] || AES-256-GCM ciphertext+tag). */
    private static String decode(String wire, byte[] key) throws Exception {
        byte[] data = Base64.getDecoder().decode(wire);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, data, 0, 12));
        return new String(c.doFinal(data, 12, data.length - 12), StandardCharsets.UTF_8);
    }

    @Test
    void producesTheDocumentedWireFormat() throws Exception {
        ContactEventCipher cipher = new ContactEventCipher(key(7));
        String wire = cipher.encrypt("+919876543210");
        assertEquals("+919876543210", decode(wire, key(7)));
        assertFalse(wire.contains("9876543210"));
        assertTrue(wire.matches("^[A-Za-z0-9+/]{20,}={0,2}$"));
    }

    @Test
    void usesAFreshIvEachTime() {
        ContactEventCipher cipher = new ContactEventCipher(key(7));
        assertNotEquals(cipher.encrypt("a@b.in"), cipher.encrypt("a@b.in"));
    }

    @Test
    void anotherKeyCannotDecrypt() {
        String wire = new ContactEventCipher(key(7)).encrypt("a@b.in");
        assertThrows(Exception.class, () -> decode(wire, key(8)));
    }

    @Test
    void rejectsAWrongSizedKey() {
        assertThrows(IllegalArgumentException.class, () -> new ContactEventCipher(new byte[16]));
    }
}

package in.foodapp.identity.infra.crypto;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class AesGcmPiiCipherTest {

    private static byte[] key(int fill) {
        byte[] k = new byte[32];
        Arrays.fill(k, (byte) fill);
        return k;
    }

    private final AesGcmPiiCipher cipher = new AesGcmPiiCipher(key(1), key(2));

    @Test
    void roundTrips() {
        byte[] ct = cipher.encrypt("+919876543210");
        assertEquals("+919876543210", cipher.decrypt(ct));
    }

    @Test
    void usesFreshIvEachTime() {
        Set<String> ivs = new HashSet<>();
        byte[] first = cipher.encrypt("+919876543210");
        byte[] second = cipher.encrypt("+919876543210");
        assertFalse(Arrays.equals(first, second));
        for (int i = 0; i < 200; i++) {
            ivs.add(Arrays.toString(Arrays.copyOfRange(cipher.encrypt("x"), 0, 12)));
        }
        assertEquals(200, ivs.size());
    }

    @Test
    void ciphertextIsIvPlusPayloadPlusTag() {
        byte[] ct = cipher.encrypt("abc");
        assertEquals(12 + 3 + 16, ct.length);
    }

    @Test
    void tamperedCiphertextIsRejected() {
        byte[] ct = cipher.encrypt("+919876543210");
        ct[ct.length - 1] ^= 0x01;
        assertThrows(IllegalStateException.class, () -> cipher.decrypt(ct));
    }

    @Test
    void wrongKeyCannotDecrypt() {
        byte[] ct = cipher.encrypt("+919876543210");
        AesGcmPiiCipher other = new AesGcmPiiCipher(key(9), key(2));
        assertThrows(IllegalStateException.class, () -> other.decrypt(ct));
    }

    @Test
    void blindIndexIsDeterministicAndKeyed() {
        String a = cipher.blindIndex("+919876543210");
        assertEquals(a, cipher.blindIndex("+919876543210"));
        assertNotEquals(a, cipher.blindIndex("+919876543211"));
        assertEquals(64, a.length());
        assertTrue(a.matches("[0-9a-f]{64}"));
        AesGcmPiiCipher otherKey = new AesGcmPiiCipher(key(1), key(3));
        assertNotEquals(a, otherKey.blindIndex("+919876543210"));
    }

    @Test
    void rejectsWrongKeyLength() {
        assertThrows(IllegalArgumentException.class, () -> new AesGcmPiiCipher(new byte[16], key(2)));
        assertArrayEquals(key(1), key(1));
    }
}

package in.foodapp.notification.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.foodapp.notification.infra.crypto.ContactCipher;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

class ContactCipherAndMaskingTest {

    private static byte[] key(int fill) {
        byte[] k = new byte[32];
        Arrays.fill(k, (byte) fill);
        return k;
    }

    @Test
    void roundTrips() {
        ContactCipher cipher = new ContactCipher(key(3));
        assertThat(cipher.decrypt(cipher.encrypt("+919876543210"))).isEqualTo("+919876543210");
    }

    /** What identity-service produces: base64(IV[12] || AES-256-GCM ciphertext+tag), key shared out of band. */
    @Test
    void readsTheWireFormatIdentityWrites() throws Exception {
        byte[] iv = new byte[12];
        Arrays.fill(iv, (byte) 9);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key(3), "AES"), new GCMParameterSpec(128, iv));
        byte[] ct = c.doFinal("ravi@example.com".getBytes(StandardCharsets.UTF_8));
        byte[] wire = new byte[12 + ct.length];
        System.arraycopy(iv, 0, wire, 0, 12);
        System.arraycopy(ct, 0, wire, 12, ct.length);

        assertThat(new ContactCipher(key(3)).decrypt(Base64.getEncoder().encodeToString(wire)))
                .isEqualTo("ravi@example.com");
    }

    @Test
    void rejectsTheWrongKeyAndGarbage() {
        String wire = new ContactCipher(key(3)).encrypt("a@b.in");
        assertThatThrownBy(() -> new ContactCipher(key(4)).decrypt(wire)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new ContactCipher(key(3)).decrypt("AAAA")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new ContactCipher(key(3)).decrypt("not base64 !!"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void masksPhonesAndEmailsForLogs() {
        assertThat(Masking.phone("+919876543210")).isEqualTo("*********3210").doesNotContain("98765");
        assertThat(Masking.phone("123")).isEqualTo("****");
        assertThat(Masking.email("ravi@example.com")).isEqualTo("r***@example.com");
        assertThat(Masking.email("a@b.in")).isEqualTo("****@b.in");
        assertThat(Masking.email(null)).isEqualTo("****");
    }
}

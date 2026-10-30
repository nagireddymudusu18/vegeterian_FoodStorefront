package in.foodapp.notification;

import in.foodapp.notification.infra.email.EmailSender;
import in.foodapp.notification.infra.sms.SmsSender;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Replaces the logging senders with ones that record what was sent and can be told to fail. */
@TestConfiguration
public class RecordingSenders {

    public record Sent(String to, String subjectOrMessage, String body) {
    }

    public static final List<Sent> SMS = new CopyOnWriteArrayList<>();
    public static final List<Sent> EMAIL = new CopyOnWriteArrayList<>();
    /** A recipient containing this text makes the send throw, to exercise retries. */
    public static volatile String failFor = null;

    @Bean
    @Primary
    SmsSender recordingSms() {
        return (to, message) -> {
            check(to);
            SMS.add(new Sent(to, message, null));
        };
    }

    @Bean
    @Primary
    EmailSender recordingEmail() {
        return (to, subject, body) -> {
            check(to);
            EMAIL.add(new Sent(to, subject, body));
        };
    }

    private static void check(String to) {
        String fail = failFor;
        if (fail != null && to.contains(fail)) {
            throw new IllegalStateException("provider down");
        }
    }
}

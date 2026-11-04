package in.foodapp.notification.infra.sms;

import in.foodapp.notification.infra.Masking;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Development sender: logs the message with the number masked. Only active when SMS_PROVIDER=logging. */
@Component
@ConditionalOnProperty(name = "app.sms-provider", havingValue = "logging")
public class LoggingSmsSender implements SmsSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingSmsSender.class);

    @Override
    public void send(String e164Phone, String message) {
        log.info("[SMS_PROVIDER=logging] to {}: {}", Masking.phone(e164Phone), message);
    }
}

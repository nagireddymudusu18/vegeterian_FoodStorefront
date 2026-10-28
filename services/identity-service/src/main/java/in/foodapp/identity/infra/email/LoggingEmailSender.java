package in.foodapp.identity.infra.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Development sender: logs the link. Only active when EMAIL_PROVIDER=logging. */
@Component
@ConditionalOnProperty(name = "app.email-provider", havingValue = "logging")
public class LoggingEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingEmailSender.class);

    @Override
    public void send(String to, Kind kind, String link) {
        log.info("[EMAIL_PROVIDER=logging] {} to {}: {}", kind, to, link);
    }
}

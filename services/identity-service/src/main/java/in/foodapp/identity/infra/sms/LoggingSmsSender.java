package in.foodapp.identity.infra.sms;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Development sender: logs the OTP. Only active when SMS_PROVIDER=logging. */
@Component
@ConditionalOnProperty(name = "app.sms-provider", havingValue = "logging")
public class LoggingSmsSender implements SmsSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingSmsSender.class);

    @Override
    public void sendOtp(String e164Phone, String code) {
        log.info("[SMS_PROVIDER=logging] OTP for {} is {}", e164Phone, code);
    }
}

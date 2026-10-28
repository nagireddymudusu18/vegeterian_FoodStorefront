package in.foodapp.identity.infra.sms;

import org.springframework.stereotype.Component;

/** No-op verifier. Replace with a Cloudflare Turnstile implementation later. */
@Component
public class AlwaysPassCaptchaVerifier implements CaptchaVerifier {

    @Override
    public boolean verify(String token, String clientIp) {
        return true;
    }
}

package in.foodapp.identity.infra.sms;

public interface CaptchaVerifier {

    /** @param token captcha response token from the client (may be null); @param clientIp caller IP */
    boolean verify(String token, String clientIp);
}

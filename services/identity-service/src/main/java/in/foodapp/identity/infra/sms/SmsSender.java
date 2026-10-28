package in.foodapp.identity.infra.sms;

public interface SmsSender {

    /** Deliver an OTP message to an E.164 phone number. */
    void sendOtp(String e164Phone, String code);
}

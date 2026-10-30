package in.foodapp.notification.infra.sms;

/** Sends one text message. The real provider (DLT-registered) is added later behind this interface. */
public interface SmsSender {

    void send(String e164Phone, String message);
}

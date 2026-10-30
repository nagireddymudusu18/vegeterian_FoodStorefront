package in.foodapp.notification.infra.email;

/** Sends one email. The real provider is added later behind this interface. */
public interface EmailSender {

    void send(String to, String subject, String body);
}

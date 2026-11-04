package in.foodapp.notification.domain;

import java.util.EnumSet;
import java.util.Set;

/** What to tell someone: it always goes to the in-app inbox, plus the listed outbound channels. */
public record Message(String kind, String title, String body, Set<Channel> outbound) {

    public enum Channel {
        EMAIL,
        SMS
    }

    public static Message inApp(String kind, String title, String body) {
        return new Message(kind, title, body, Set.of());
    }

    public Message withEmail() {
        return plus(Channel.EMAIL);
    }

    public Message withSms() {
        return plus(Channel.SMS);
    }

    private Message plus(Channel channel) {
        Set<Channel> all = outbound.isEmpty() ? EnumSet.noneOf(Channel.class) : EnumSet.copyOf(outbound);
        all.add(channel);
        return new Message(kind, title, body, Set.copyOf(all));
    }
}

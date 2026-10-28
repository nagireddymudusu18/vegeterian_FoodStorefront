package in.foodapp.catalog.service;

import java.util.UUID;

/** Authenticated principal as seen by the service layer. */
public record Caller(UUID userId, boolean admin) {

    public static Caller admin(UUID userId) {
        return new Caller(userId, true);
    }

    public static Caller owner(UUID userId) {
        return new Caller(userId, false);
    }
}

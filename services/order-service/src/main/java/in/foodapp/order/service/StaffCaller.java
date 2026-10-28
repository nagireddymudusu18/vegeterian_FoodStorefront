package in.foodapp.order.service;

import java.util.UUID;

/** The authenticated merchant-side caller of a staff transition: ADMIN may act on any order. */
public record StaffCaller(UUID userId, boolean admin) {

    public static StaffCaller admin(UUID userId) {
        return new StaffCaller(userId, true);
    }

    public static StaffCaller restaurant(UUID userId) {
        return new StaffCaller(userId, false);
    }
}

package in.foodapp.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.foodapp.notification.domain.Message;
import in.foodapp.notification.persistence.FeedFailureStore;
import in.foodapp.notification.persistence.NotificationStore;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** The inbox API: ownership, role broadcasts with per-user read marks, expiry, and the admin dead-letter calls. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(RecordingSenders.class)
class NotificationApiTest {

    static final TestDatabase.Conn DB = TestDatabase.start("notification");
    private static final AtomicLong EVENT_IDS = new AtomicLong(50_000);

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", DB::url);
        r.add("spring.datasource.username", DB::user);
        r.add("spring.datasource.password", DB::password);
        r.add("app.contact-event-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
        r.add("app.feed.identity-key", () -> "");
        r.add("app.feed.catalog-key", () -> "");
        r.add("app.feed.order-key", () -> "");
        r.add("app.feed.payment-key", () -> "");
        r.add("app.feed.fleet-key", () -> "");
        r.add("NOTIFY_DISPATCH_MS", () -> "3600000");
    }

    @Autowired
    MockMvc mvc;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    NotificationStore store;
    @Autowired
    FeedFailureStore failures;

    private static JwtRequestPostProcessor as(UUID user, String... roles) {
        return SecurityMockMvcRequestPostProcessors.jwt()
                .jwt(j -> j.subject(user.toString()).claim("roles", List.of(roles)))
                .authorities(java.util.Arrays.stream(roles)
                        .map(r -> (org.springframework.security.core.GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + r))
                        .toArray(org.springframework.security.core.GrantedAuthority[]::new));
    }

    private UUID give(UUID user, String title) {
        store.createForUser(user, Message.inApp("TEST", title, "body of " + title), null, "test:" + UUID.randomUUID());
        return jdbc.queryForObject("SELECT id FROM notification WHERE user_id = ? AND title = ?", UUID.class, user,
                title);
    }

    @Test
    void requiresASignedInUser() throws Exception {
        mvc.perform(get("/notifications")).andExpect(status().isUnauthorized());
        mvc.perform(get("/notifications/unread-count")).andExpect(status().isUnauthorized());
        mvc.perform(post("/notifications/read-all")).andExpect(status().isUnauthorized());
    }

    @Test
    void listsOnlyMyNotificationsNewestFirstWithAnUnreadCount() throws Exception {
        UUID me = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        give(me, "first");
        give(other, "not mine");
        Thread.sleep(5);
        give(me, "second");

        mvc.perform(get("/notifications").with(as(me, "CUSTOMER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unread").value(2))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].title").value("second"))
                .andExpect(jsonPath("$.items[1].title").value("first"))
                .andExpect(jsonPath("$.items[0].read").value(false));
        mvc.perform(get("/notifications/unread-count").with(as(me, "CUSTOMER")))
                .andExpect(jsonPath("$.unread").value(2));
    }

    @Test
    void markingReadChangesOnlyMyCopyAndIsIdempotent() throws Exception {
        UUID me = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        UUID mine = give(me, "read me");
        give(me, "leave me");
        UUID theirs = give(other, "theirs");

        mvc.perform(post("/notifications/" + mine + "/read").with(as(me, "CUSTOMER"))).andExpect(status().isNoContent());
        mvc.perform(post("/notifications/" + mine + "/read").with(as(me, "CUSTOMER"))).andExpect(status().isNoContent());
        mvc.perform(get("/notifications/unread-count").with(as(me, "CUSTOMER")))
                .andExpect(jsonPath("$.unread").value(1));

        // somebody else's notification looks exactly like one that does not exist
        mvc.perform(post("/notifications/" + theirs + "/read").with(as(me, "CUSTOMER"))).andExpect(status().isNotFound());
        mvc.perform(post("/notifications/" + UUID.randomUUID() + "/read").with(as(me, "CUSTOMER")))
                .andExpect(status().isNotFound());
        mvc.perform(get("/notifications/unread-count").with(as(other, "CUSTOMER")))
                .andExpect(jsonPath("$.unread").value(1));

        mvc.perform(post("/notifications/read-all").with(as(me, "CUSTOMER"))).andExpect(status().isNoContent());
        mvc.perform(get("/notifications/unread-count").with(as(me, "CUSTOMER")))
                .andExpect(jsonPath("$.unread").value(0));
        mvc.perform(get("/notifications/unread-count").with(as(other, "CUSTOMER")))
                .andExpect(jsonPath("$.unread").value(1));
    }

    @Test
    void broadcastsReachOnlyTheRoleAndEachPartnerKeepsTheirOwnReadMark() throws Exception {
        UUID order = UUID.randomUUID();
        store.createForAudience("PARTNER", Message.inApp("NEW_JOB", "Job " + order, "pickup"), order, "job:" + order);
        UUID rider1 = UUID.randomUUID();
        UUID rider2 = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        UUID id = jdbc.queryForObject("SELECT id FROM notification WHERE order_id = ? AND audience = 'PARTNER'",
                UUID.class, order);

        mvc.perform(get("/notifications").with(as(rider1, "CUSTOMER", "PARTNER")))
                .andExpect(jsonPath("$.items[?(@.title == 'Job %s')]", order).exists());
        mvc.perform(get("/notifications").with(as(customer, "CUSTOMER")))
                .andExpect(jsonPath("$.items[?(@.title == 'Job %s')]", order).doesNotExist());
        mvc.perform(post("/notifications/" + id + "/read").with(as(customer, "CUSTOMER")))
                .andExpect(status().isNotFound());

        mvc.perform(post("/notifications/" + id + "/read").with(as(rider1, "PARTNER"))).andExpect(status().isNoContent());
        mvc.perform(get("/notifications").with(as(rider1, "PARTNER")))
                .andExpect(jsonPath("$.items[?(@.title == 'Job %s')].read", order).value(true));
        mvc.perform(get("/notifications").with(as(rider2, "PARTNER")))
                .andExpect(jsonPath("$.items[?(@.title == 'Job %s')].read", order).value(false));
    }

    @Test
    void aBroadcastExpiresFromTheInboxButAPersonalNotificationDoesNot() throws Exception {
        UUID order = UUID.randomUUID();
        UUID rider = UUID.randomUUID();
        store.createForAudience("PARTNER", Message.inApp("NEW_JOB", "Old job " + order, "x"), order, "job:" + order);
        UUID personal = give(rider, "personal");
        jdbc.update("UPDATE notification SET created_at = now() - interval '3 hours' WHERE order_id = ? "
                + "OR id = ?", order, personal);

        mvc.perform(get("/notifications").with(as(rider, "PARTNER")))
                .andExpect(jsonPath("$.items[?(@.title == 'Old job %s')]", order).doesNotExist())
                .andExpect(jsonPath("$.items[?(@.title == 'personal')]").exists());
    }

    @Test
    void theLimitIsBounded() throws Exception {
        UUID me = UUID.randomUUID();
        for (int i = 0; i < 3; i++) {
            give(me, "n" + i);
        }
        mvc.perform(get("/notifications?limit=2").with(as(me, "CUSTOMER")))
                .andExpect(jsonPath("$.items.length()").value(2)).andExpect(jsonPath("$.unread").value(3));
        mvc.perform(get("/notifications?limit=0").with(as(me, "CUSTOMER")))
                .andExpect(jsonPath("$.items.length()").value(1));
    }

    @Test
    void onlyAdminsCanManageDeadLetters() throws Exception {
        long eventId = EVENT_IDS.incrementAndGet();
        failures.park("order", eventId, "OrderStatusChanged", UUID.randomUUID(), "{}", "Malformed event: test", 1);
        long id = jdbc.queryForObject("SELECT id FROM feed_dead_letter WHERE source = 'order' AND event_id = ?",
                Long.class, eventId);
        UUID admin = UUID.randomUUID();

        mvc.perform(get("/notifications/admin/dead-letters")).andExpect(status().isUnauthorized());
        mvc.perform(get("/notifications/admin/dead-letters").with(as(UUID.randomUUID(), "CUSTOMER")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/notifications/admin/dead-letters").with(as(admin, "ADMIN")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.open").isNumber());

        mvc.perform(post("/notifications/admin/dead-letters/" + id + "/retry").with(as(admin, "ADMIN")))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(post("/notifications/admin/dead-letters/" + id + "/discard").with(as(admin, "ADMIN")))
                .andExpect(status().isNoContent());
        mvc.perform(post("/notifications/admin/dead-letters/" + id + "/discard").with(as(admin, "ADMIN")))
                .andExpect(status().isNotFound());
        assertThat(failures.findOpen(id)).isEmpty();
    }

    @Test
    void everythingElseIsClosed() throws Exception {
        mvc.perform(get("/internal/events").with(as(UUID.randomUUID(), "ADMIN"))).andExpect(status().isForbidden());
    }
}

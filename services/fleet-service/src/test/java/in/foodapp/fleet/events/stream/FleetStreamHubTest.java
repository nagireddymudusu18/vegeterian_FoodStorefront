package in.foodapp.fleet.events.stream;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class FleetStreamHubTest {

    @Test
    void opensUpToTheLimitThenRefuses() {
        FleetStreamHub hub = new FleetStreamHub();
        for (int i = 0; i < FleetStreamHub.MAX_TOTAL; i++) {
            assertThat(hub.open()).isPresent();
        }
        assertThat(hub.open()).isEmpty();
        assertThat(hub.connections()).isEqualTo(FleetStreamHub.MAX_TOTAL);
    }

    @Test
    void broadcastAndHeartbeatDoNotFailWithNoListeners() {
        FleetStreamHub hub = new FleetStreamHub();
        hub.onChanged(new FleetChangedEvent());
        hub.heartbeat();
        assertThat(hub.connections()).isZero();
    }
}

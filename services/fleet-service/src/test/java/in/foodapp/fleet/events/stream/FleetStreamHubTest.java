package in.foodapp.fleet.events.stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.util.ArrayDeque;
import java.util.List;
import java.util.Queue;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter.SseEventBuilder;

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

    @Test
    void aDeadConnectionIsDroppedAndDoesNotStopTheHeartbeatForOthers() throws Exception {
        SseEmitter dead = mock(SseEmitter.class);
        SseEmitter alive = mock(SseEmitter.class);
        Queue<SseEmitter> emitters = new ArrayDeque<>(List.of(dead, alive));
        FleetStreamHub hub = new FleetStreamHub(emitters::remove);
        hub.open();
        hub.open();
        // the container has already closed the dead client's connection: sending AND completing both fail
        doThrow(new IllegalStateException("AsyncContext after an error")).when(dead).send(any(SseEventBuilder.class));
        doThrow(new IllegalStateException("already completed")).when(dead).complete();

        assertThatCode(hub::heartbeat).doesNotThrowAnyException();
        assertThatCode(() -> hub.onChanged(new FleetChangedEvent())).doesNotThrowAnyException();

        assertThat(hub.connections()).isEqualTo(1);
        // opening event + heartbeat + change
        verify(alive, times(3)).send(any(SseEventBuilder.class));
    }
}

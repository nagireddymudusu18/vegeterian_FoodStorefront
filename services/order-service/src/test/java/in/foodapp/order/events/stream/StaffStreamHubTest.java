package in.foodapp.order.events.stream;

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
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter.SseEventBuilder;

class StaffStreamHubTest {

    @Test
    void heartbeatDoesNotFailWithNoListeners() {
        StaffStreamHub hub = new StaffStreamHub();
        hub.heartbeat();
        assertThat(hub.connections()).isZero();
    }

    @Test
    void aDeadConnectionIsDroppedAndDoesNotStopTheHeartbeatForOthers() throws Exception {
        SseEmitter dead = mock(SseEmitter.class);
        SseEmitter alive = mock(SseEmitter.class);
        Queue<SseEmitter> emitters = new ArrayDeque<>(List.of(dead, alive));
        StaffStreamHub hub = new StaffStreamHub(emitters::remove);
        hub.open(UUID.randomUUID(), true);
        hub.open(UUID.randomUUID(), true);
        // the container has already closed the dead client's connection: sending AND completing both fail
        doThrow(new IllegalStateException("AsyncContext after an error")).when(dead).send(any(SseEventBuilder.class));
        doThrow(new IllegalStateException("already completed")).when(dead).complete();

        assertThatCode(hub::heartbeat).doesNotThrowAnyException();

        assertThat(hub.connections()).isEqualTo(1);
        // opening event + heartbeat
        verify(alive, times(2)).send(any(SseEventBuilder.class));
    }
}

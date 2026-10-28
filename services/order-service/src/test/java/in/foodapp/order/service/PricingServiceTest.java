package in.foodapp.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.foodapp.order.api.ApiException;
import in.foodapp.order.api.CreateOrderRequest;
import in.foodapp.order.persistence.MenuItemReplica;
import in.foodapp.order.persistence.MenuItemReplicaRepository;
import in.foodapp.order.persistence.RestaurantReplica;
import in.foodapp.order.persistence.RestaurantReplicaRepository;
import in.foodapp.order.service.PricingService.LineRequest;
import in.foodapp.order.service.PricingService.PricedOrder;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class PricingServiceTest {

    private final RestaurantReplicaRepository restaurants = mock(RestaurantReplicaRepository.class);
    private final MenuItemReplicaRepository items = mock(MenuItemReplicaRepository.class);
    private final UUID restaurantId = UUID.randomUUID();
    private PricingService pricing;

    @BeforeEach
    void setUp() {
        pricing = new PricingService(restaurants, items, BigDecimal.valueOf(5), 3000);
        when(restaurants.findById(restaurantId)).thenReturn(Optional.of(restaurant(true)));
    }

    private RestaurantReplica restaurant(boolean open) {
        return new RestaurantReplica(restaurantId).update("R", 1, 1, open, 5000, "GOLD", "F1", 1);
    }

    private MenuItemReplica item(UUID id, UUID restaurant, long price, boolean available) {
        return new MenuItemReplica(id).update(restaurant, "Item-" + price, price, true, false, false, available, 1);
    }

    @Test
    void computesSubtotalTaxFeeAndTotal() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        when(items.findAllById(any())).thenReturn(List.of(item(a, restaurantId, 10000, true),
                item(b, restaurantId, 5050, true)));
        PricedOrder p = pricing.price(restaurantId, List.of(new LineRequest(a, 2), new LineRequest(b, 1)));
        assertThat(p.subtotalPaise()).isEqualTo(25050);
        assertThat(p.taxPaise()).isEqualTo(1253); // 1252.5 -> half-up
        assertThat(p.deliveryFeePaise()).isEqualTo(3000);
        assertThat(p.totalPaise()).isEqualTo(25050 + 1253 + 3000);
        assertThat(p.lines()).hasSize(2);
        assertThat(p.lines().get(0).lineTotalPaise()).isEqualTo(20000);
    }

    @Test
    void gstRoundsHalfUp() {
        UUID a = UUID.randomUUID();
        // 5% of 1010 = 50.5 -> 51 ; 5% of 1009 = 50.45 -> 50
        when(items.findAllById(any())).thenReturn(List.of(item(a, restaurantId, 1010, true)));
        assertThat(pricing.price(restaurantId, List.of(new LineRequest(a, 1))).taxPaise()).isEqualTo(51);
        when(items.findAllById(any())).thenReturn(List.of(item(a, restaurantId, 1009, true)));
        assertThat(pricing.price(restaurantId, List.of(new LineRequest(a, 1))).taxPaise()).isEqualTo(50);
    }

    @Test
    void duplicateLinesAreMerged() {
        UUID a = UUID.randomUUID();
        when(items.findAllById(any())).thenReturn(List.of(item(a, restaurantId, 100, true)));
        PricedOrder p = pricing.price(restaurantId, List.of(new LineRequest(a, 2), new LineRequest(a, 3)));
        assertThat(p.lines()).hasSize(1);
        assertThat(p.lines().get(0).quantity()).isEqualTo(5);
        assertThat(p.subtotalPaise()).isEqualTo(500);
    }

    @Test
    void unavailableItemIsRejectedWith409AndItemIds() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        when(items.findAllById(any())).thenReturn(List.of(item(a, restaurantId, 100, true),
                item(b, restaurantId, 200, false)));
        assertThatThrownBy(() -> pricing.price(restaurantId, List.of(new LineRequest(a, 1), new LineRequest(b, 1))))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(e.getProperties().get("itemIds")).isEqualTo(List.of(b));
                });
    }

    @Test
    void itemFromAnotherRestaurantIsRejected() {
        UUID a = UUID.randomUUID();
        when(items.findAllById(any())).thenReturn(List.of(item(a, UUID.randomUUID(), 100, true)));
        assertThatThrownBy(() -> pricing.price(restaurantId, List.of(new LineRequest(a, 1))))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void unknownItemIsRejected() {
        when(items.findAllById(any())).thenReturn(List.of());
        assertThatThrownBy(() -> pricing.price(restaurantId, List.of(new LineRequest(UUID.randomUUID(), 1))))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void closedRestaurantIsRejectedWith409() {
        when(restaurants.findById(restaurantId)).thenReturn(Optional.of(restaurant(false)));
        assertThatThrownBy(() -> pricing.price(restaurantId, List.of(new LineRequest(UUID.randomUUID(), 1))))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void unknownRestaurantIs404() {
        UUID other = UUID.randomUUID();
        when(restaurants.findById(other)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> pricing.price(other, List.of(new LineRequest(UUID.randomUUID(), 1))))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void quantityOutOfRangeIsRejected() {
        UUID a = UUID.randomUUID();
        assertThatThrownBy(() -> pricing.price(restaurantId, List.of(new LineRequest(a, 0))))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> pricing.price(restaurantId, List.of(new LineRequest(a, 21))))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void clientSuppliedTotalsInRequestBodyAreIgnoredByTheDto() throws Exception {
        UUID a = UUID.randomUUID();
        String json = """
                {"restaurantId":"%s","totalPaise":1,"subtotalPaise":1,"taxPaise":0,"deliveryFeePaise":0,
                 "lines":[{"itemId":"%s","quantity":2,"unitPricePaise":1,"pricePaise":1,"lineTotalPaise":1}]}
                """.formatted(restaurantId, a);
        CreateOrderRequest req = new ObjectMapper().readValue(json, CreateOrderRequest.class);

        when(items.findAllById(any())).thenReturn(List.of(item(a, restaurantId, 10000, true)));
        List<LineRequest> lines = req.lines().stream()
                .map(l -> new LineRequest(l.itemId(), l.quantity())).toList();
        PricedOrder p = pricing.price(req.restaurantId(), lines);

        assertThat(p.subtotalPaise()).isEqualTo(20000);
        assertThat(p.taxPaise()).isEqualTo(1000);
        assertThat(p.totalPaise()).isEqualTo(24000);
    }
}

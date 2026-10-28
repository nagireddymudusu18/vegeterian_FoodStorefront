package in.foodapp.catalog.config;

import in.foodapp.catalog.api.MenuItemRequest;
import in.foodapp.catalog.api.RestaurantRequest;
import in.foodapp.catalog.api.RestaurantView;
import in.foodapp.catalog.domain.KitchenCertificationLevel;
import in.foodapp.catalog.persistence.RestaurantRepository;
import in.foodapp.catalog.service.Caller;
import in.foodapp.catalog.service.CatalogService;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Demo data around Bengaluru (12.9716, 77.5946). Enabled with SEED_DEMO_DATA=true; only seeds an empty database.
 * Goes through {@link CatalogService} so outbox events are emitted like any normal write.
 */
@Component
@ConditionalOnProperty(name = "app.seed-demo-data", havingValue = "true")
public class DevSeedData implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevSeedData.class);

    /** Fixed owner id for seeded restaurants. */
    public static final UUID SEED_OWNER = UUID.fromString("00000000-0000-0000-0000-000000000001");

    private final CatalogService catalog;
    private final RestaurantRepository restaurants;

    public DevSeedData(CatalogService catalog, RestaurantRepository restaurants) {
        this.catalog = catalog;
        this.restaurants = restaurants;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (restaurants.count() > 0) {
            log.info("Seed skipped: restaurants already present");
            return;
        }
        Caller admin = Caller.admin(SEED_OWNER);

        RestaurantView saffron = restaurant(admin, "Saffron Pure Veg Bhavan", "11224001000101", "South Indian",
                KitchenCertificationLevel.TIER_1_EXCLUSIVE_VEG, 12.9750, 77.6050, 6000);
        item(admin, saffron, "Paneer Butter Masala", "Creamy tomato gravy with paneer", 24900,
                true, false, false, List.of("paneer", "butter", "tomato", "cream", "onion"), List.of("milk"));
        item(admin, saffron, "Masala Dosa", "Crisp rice crepe with potato masala", 14900,
                true, true, false, List.of("rice", "urad dal", "potato", "onion", "mustard seeds", "oil"), List.of());
        item(admin, saffron, "Idli Sambar", "Steamed idlis with lentil stew", 11900,
                true, true, false, List.of("rice", "urad dal", "toor dal", "tomato", "onion"), List.of());
        item(admin, saffron, "Dal Tadka", "Yellow lentils tempered with ghee and garlic", 17900,
                true, false, false, List.of("toor dal", "ghee", "garlic", "cumin"), List.of("milk"));
        item(admin, saffron, "Vegetable Biryani", "Basmati rice layered with vegetables and curd", 21900,
                true, false, false, List.of("basmati rice", "carrot", "beans", "yogurt", "spices"), List.of("milk"));
        item(admin, saffron, "Gulab Jamun", "Milk-solid dumplings in sugar syrup", 9900,
                true, false, false, List.of("khoya", "sugar", "ghee", "cardamom"), List.of("milk", "gluten"));

        RestaurantView green = restaurant(admin, "Green Leaf Vegan Kitchen", "11224001000102", "Vegan",
                KitchenCertificationLevel.TIER_1_EXCLUSIVE_VEG, 12.9600, 77.5900, 5000);
        item(admin, green, "Tofu Tikka Bowl", "Grilled tofu with peppers in coconut cream", 27900,
                true, true, false, List.of("tofu", "bell pepper", "coconut cream", "spices"), List.of("soy"));
        item(admin, green, "Chana Masala", "Chickpea curry", 18900,
                true, true, false, List.of("chickpeas", "tomato", "onion", "spices"), List.of());
        item(admin, green, "Jackfruit Biryani", "Slow-cooked jackfruit and basmati rice", 25900,
                true, true, false, List.of("jackfruit", "basmati rice", "coconut oil", "spices"), List.of());
        item(admin, green, "Coconut Milk Kheer", "Rice pudding in coconut milk and jaggery", 12900,
                true, true, false, List.of("rice", "coconut milk", "jaggery", "cardamom"), List.of());
        item(admin, green, "Millet Upma", "Foxtail millet upma without onion", 12900,
                true, true, true, List.of("foxtail millet", "peas", "curry leaves", "mustard seeds"), List.of());
        item(admin, green, "Peanut Butter Banana Smoothie", "Oat milk smoothie", 16900,
                true, true, false, List.of("peanut butter", "banana", "oat milk"), List.of("peanuts"));

        RestaurantView jain = restaurant(admin, "Jain Rasoi", "11224001000103", "Gujarati",
                KitchenCertificationLevel.TIER_1_EXCLUSIVE_VEG, 12.9850, 77.5800, 5000);
        item(admin, jain, "Jain Pav Bhaji", "Mashed vegetables without onion, garlic or potato", 15900,
                true, false, true, List.of("tomato", "peas", "capsicum", "butter", "pav"), List.of("milk", "gluten"));
        item(admin, jain, "Sabudana Khichdi", "Tapioca pearls with peanuts", 13900,
                true, true, true, List.of("sabudana", "peanuts", "cumin", "green chilli", "oil"), List.of("peanuts"));
        item(admin, jain, "Khaman Dhokla", "Steamed gram flour cake", 9900,
                true, true, true, List.of("gram flour", "lemon juice", "fruit salt", "mustard seeds", "sugar"), List.of());
        item(admin, jain, "Paneer Tikka (Jain)", "Tandoori paneer with peppers", 21900,
                true, false, true, List.of("paneer", "bell pepper", "yogurt", "spices"), List.of("milk"));
        item(admin, jain, "Kesar Shrikhand", "Saffron strained-curd dessert", 12900,
                true, false, true, List.of("hung curd", "saffron", "sugar", "cardamom"), List.of("milk"));
        item(admin, jain, "Jain Dal Dhokli", "Wheat dumplings in sweet-sour dal", 17900,
                true, true, true, List.of("toor dal", "wheat flour", "jaggery", "peanuts", "kokum"), List.of("gluten", "peanuts"));

        RestaurantView spice = restaurant(admin, "Spice Route Kitchen", "11224001000104", "North Indian",
                KitchenCertificationLevel.TIER_2_SEGREGATED_KITCHEN, 12.9700, 77.6000, 4000);
        item(admin, spice, "Chicken Biryani", "Dum biryani with bone-in chicken", 29900,
                false, false, false, List.of("chicken", "basmati rice", "yogurt", "spices"), List.of("milk"));
        item(admin, spice, "Butter Chicken", "Tandoori chicken in tomato-butter gravy", 32900,
                false, false, false, List.of("chicken", "butter", "cream", "tomato"), List.of("milk"));
        item(admin, spice, "Egg Curry", "Boiled eggs in onion-tomato masala", 21900,
                false, false, false, List.of("egg", "onion", "tomato", "spices"), List.of("egg"));
        item(admin, spice, "Fish Fry", "Masala-crusted pomfret", 31900,
                false, false, false, List.of("fish", "rice flour", "spices"), List.of("fish"));
        item(admin, spice, "Veg Thali", "Dal, paneer, rice and roti", 23900,
                true, false, false, List.of("toor dal", "paneer", "rice", "wheat flour", "cumin"), List.of("milk", "gluten"));
        item(admin, spice, "Mushroom Pepper Fry", "Stir-fried mushrooms with black pepper", 19900,
                true, true, false, List.of("mushroom", "black pepper", "onion", "oil"), List.of());

        log.info("Seeded {} demo restaurants", restaurants.count());
    }

    private RestaurantView restaurant(Caller admin, String name, String fssai, String cuisine,
                                      KitchenCertificationLevel level, double lat, double lng, int radius) {
        return catalog.createRestaurant(
                new RestaurantRequest(name, fssai, level, lat, lng, radius, true, SEED_OWNER, cuisine), admin);
    }

    private void item(Caller admin, RestaurantView r, String name, String description, long price,
                      boolean pureVeg, boolean vegan, boolean jain, List<String> ingredients,
                      List<String> allergens) {
        catalog.addItem(r.id(),
                new MenuItemRequest(name, description, price, pureVeg, vegan, jain, allergens, ingredients, true),
                admin);
    }
}

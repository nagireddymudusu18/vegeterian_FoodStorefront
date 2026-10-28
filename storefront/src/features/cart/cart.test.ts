import { describe, expect, it } from "vitest";
import {
  addItem,
  decrementItem,
  emptyCart,
  estimatedSubtotalPaise,
  itemCount,
  MAX_QTY_PER_LINE,
  parseCart,
  quantityOf,
  removeItem,
  toOrderLines,
  wouldSwitchRestaurant,
} from "./cart";

const r1 = { id: "r1", name: "Veg Palace" };
const r2 = { id: "r2", name: "Jain Bhojan" };
const dosa = { itemId: "i1", name: "Dosa", pricePaise: 8000 };
const idli = { itemId: "i2", name: "Idli", pricePaise: 5050 };

describe("cart", () => {
  it("adds and increments items", () => {
    let c = addItem(emptyCart, r1, dosa);
    c = addItem(c, r1, dosa);
    c = addItem(c, r1, idli);
    expect(c.restaurantId).toBe("r1");
    expect(quantityOf(c, "i1")).toBe(2);
    expect(itemCount(c)).toBe(3);
    expect(estimatedSubtotalPaise(c)).toBe(2 * 8000 + 5050);
  });

  it("caps quantity per line", () => {
    let c = emptyCart;
    for (let i = 0; i < MAX_QTY_PER_LINE + 5; i++) c = addItem(c, r1, dosa);
    expect(quantityOf(c, "i1")).toBe(MAX_QTY_PER_LINE);
  });

  it("decrement removes the line at zero and empties the cart", () => {
    let c = addItem(addItem(emptyCart, r1, dosa), r1, dosa);
    c = decrementItem(c, "i1");
    expect(quantityOf(c, "i1")).toBe(1);
    c = decrementItem(c, "i1");
    expect(c).toEqual(emptyCart);
  });

  it("removeItem drops a line", () => {
    const c = addItem(addItem(emptyCart, r1, dosa), r1, idli);
    const after = removeItem(c, "i1");
    expect(after.lines.map((l) => l.itemId)).toEqual(["i2"]);
  });

  it("single-restaurant rule: detects and replaces on switch", () => {
    const c = addItem(emptyCart, r1, dosa);
    expect(wouldSwitchRestaurant(c, "r2")).toBe(true);
    expect(wouldSwitchRestaurant(c, "r1")).toBe(false);
    expect(wouldSwitchRestaurant(emptyCart, "r2")).toBe(false);
    const switched = addItem(c, r2, idli);
    expect(switched.restaurantId).toBe("r2");
    expect(switched.lines).toHaveLength(1);
    expect(switched.lines[0].itemId).toBe("i2");
  });

  it("order lines never contain prices", () => {
    const c = addItem(emptyCart, r1, dosa);
    expect(toOrderLines(c)).toEqual([{ itemId: "i1", quantity: 1 }]);
  });

  it("parseCart tolerates garbage and validates lines", () => {
    expect(parseCart(null)).toEqual(emptyCart);
    expect(parseCart("not json")).toEqual(emptyCart);
    expect(parseCart('{"restaurantId":1,"lines":[]}')).toEqual(emptyCart);
    const good = addItem(emptyCart, r1, dosa);
    expect(parseCart(JSON.stringify(good))).toEqual(good);
    const bad = JSON.stringify({
      restaurantId: "r1",
      restaurantName: "x",
      lines: [{ itemId: "i1", name: "d", pricePaise: 1.5, quantity: 1 }, { itemId: "i2", name: "e", pricePaise: 100, quantity: 2 }],
    });
    expect(parseCart(bad).lines).toHaveLength(1);
  });
});

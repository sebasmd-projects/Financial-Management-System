import { NOTIFICATION_ROUTE, parsePushData, REVIEW_ROUTE, routeFor } from "./routing";

const ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OBJ = "55555555-5555-4555-8555-555555555555";

describe("carga de un aviso push (solo ids)", () => {
  it("lee los ids y descarta la ruta que trae el servidor", () => {
    expect(parsePushData({ type: "notification", notification_id: ID, path: `/notificaciones/${ID}`, object_kind: "occurrence", object_id: OBJ })).toEqual({ notificationId: ID, objectKind: "occurrence", objectId: OBJ });
  });
  it("el objeto es opcional", () => {
    expect(parsePushData({ type: "notification", notification_id: ID })).toEqual({ notificationId: ID, objectKind: null, objectId: null });
    expect(parsePushData({ type: "notification", notification_id: ID, object_kind: "card" })).toEqual({ notificationId: ID, objectKind: null, objectId: null });
  });
  it("rechaza lo que no tiene la forma esperada (ids que no son UUID, otro tipo, basura)", () => {
    for (const data of [null, undefined, "x", 3, [], {}, { type: "other", notification_id: ID }, { type: "notification" }, { type: "notification", notification_id: "../../etc" }, { type: "notification", notification_id: `${ID}?amount=5` }]) expect(parsePushData(data)).toBeNull();
    expect(parsePushData({ type: "notification", notification_id: ID, object_kind: "Occ urrence!", object_id: OBJ })?.objectKind).toBeNull();
    expect(parsePushData({ type: "notification", notification_id: ID, object_kind: "card", object_id: "javascript:1" })?.objectId).toBeNull();
  });
  it("siempre abre el centro de avisos: una ruta literal sin parámetros", () => {
    expect(NOTIFICATION_ROUTE).toBe("/notifications");
  });
  it("un movimiento propuesto por el correo abre «Por revisar»; el resto, el centro de avisos (rutas literales)", () => {
    expect(REVIEW_ROUTE).toBe("/review");
    expect(routeFor({ objectKind: "sync_event" })).toBe("/review");
    expect(routeFor({ objectKind: "sync_connection" })).toBe("/notifications");
    expect(routeFor({ objectKind: "occurrence" })).toBe("/notifications");
    expect(routeFor({ objectKind: null })).toBe("/notifications");
    const target = parsePushData({ type: "notification", notification_id: ID, object_kind: "sync_event", object_id: OBJ });
    expect(target).toEqual({ notificationId: ID, objectKind: "sync_event", objectId: OBJ });
  });
});

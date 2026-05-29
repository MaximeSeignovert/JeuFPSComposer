import { MapSchema, Schema, type } from "@colyseus/schema";

export class Vec3State extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;

  constructor(position?: Partial<Vec3State>) {
    super();
    if (position) this.setValues(position);
  }

  setValues(position: Partial<Vec3State>) {
    this.x = Number(position.x) || 0;
    this.y = Number(position.y) || 0;
    this.z = Number(position.z) || 0;
  }

  asPlain() {
    return { x: this.x, y: this.y, z: this.z };
  }
}

export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "Player";
  @type("string") team = "ffa";
  @type("string") weapon = "ak47";
  @type("number") health = 100;
  @type("boolean") alive = true;
  @type("number") kills = 0;
  @type("number") deaths = 0;
  @type("number") grenades = 0;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") rotationY = 0;

  setPosition(position: Vec3Like) {
    this.x = Number(position.x) || 0;
    this.y = Number(position.y) || 0;
    this.z = Number(position.z) || 0;
  }

  get position(): Vec3Like {
    return { x: this.x, y: this.y, z: this.z };
  }
}

export class GrenadePickupState extends Schema {
  @type("string") id = "";
  @type(Vec3State) position = new Vec3State();
  @type("boolean") available = true;
}

export class ActiveGrenadeState extends Schema {
  @type("string") id = "";
  @type("string") ownerId = "";
  @type("number") thrownAt = 0;
}

export class FpsState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: GrenadePickupState }) grenadePickups = new MapSchema<GrenadePickupState>();
  @type({ map: ActiveGrenadeState }) activeGrenades = new MapSchema<ActiveGrenadeState>();
}

export type Vec3Like = {
  x: number;
  y: number;
  z: number;
};

import * as restate from "@restatedev/restate-sdk";
import { dropObject } from "./drop.js";
import { participantObject } from "./participant.js";
import { userRolloverObject } from "./user-rollover.js";
import { userLoyaltyObject } from "./user-loyalty.js";

// Create Restate server with services
restate.serve({
  services: [dropObject, participantObject, userRolloverObject, userLoyaltyObject],
});

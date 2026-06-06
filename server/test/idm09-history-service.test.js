import { describe, expect, test } from "vitest";

import { createSerialHistoryService } from "../src/idm09/serialHistoryService.js";

describe("IDM-09 serial history service", () => {
  test("T09-01 returns a full chronological serial timeline with exceptions", async () => {
    const service = createSerialHistoryService({
      repositories: {
        serialHistories: {
          async findBySerialNo() {
            return {
              serial: { serialNo: "MTK1234567890" },
              events: [
                { eventType: "SRN", eventAt: "2026-01-03T00:00:00.000Z" },
                { eventType: "PRODUCTION", eventAt: "2026-01-01T00:00:00.000Z" },
                { eventType: "GRN", eventAt: "2026-01-02T00:00:00.000Z" }
              ],
              exceptions: [{ ruleCode: "WRONG_SERIAL", raisedAt: "2026-01-02T01:00:00.000Z" }]
            };
          }
        }
      }
    });

    const result = await service.getSerialHistory({ serialNo: "MTK1234567890" });

    expect(result.found).toBe(true);
    expect(result.timeline.map((item) => item.type)).toEqual(["EVENT", "EVENT", "EXCEPTION", "EVENT"]);
  });

  test("T09-02 returns not found for unknown serials", async () => {
    const service = createSerialHistoryService({
      repositories: { serialHistories: { async findBySerialNo() { return null; } } }
    });

    await expect(service.getSerialHistory({ serialNo: "UNKNOWN1" })).resolves.toEqual({
      found: false,
      serial: null,
      timeline: []
    });
  });

  test("T09-02b exposes correction-ready exception fields in the timeline", async () => {
    const service = createSerialHistoryService({
      repositories: {
        serialHistories: {
          async findBySerialNo() {
            return {
              serial: { serialNo: "MTK1234567890" },
              events: [],
              exceptions: [
                {
                  ruleCode: "WRONG_SERIAL",
                  status: "CORRECTED",
                  raisedAt: "2026-01-02T01:00:00.000Z",
                  correctedAt: "2026-01-02T02:00:00.000Z",
                  correctedBy: "supervisor_1"
                }
              ]
            };
          }
        }
      }
    });

    const result = await service.getSerialHistory({ serialNo: "MTK1234567890" });

    expect(result.timeline[0]).toMatchObject({
      type: "EXCEPTION",
      ruleCode: "WRONG_SERIAL",
      status: "CORRECTED",
      correctedAt: "2026-01-02T02:00:00.000Z",
      correctedBy: "supervisor_1"
    });
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui";
import ReportDialog from "./ReportDialog";
import {
  loadReportReasonCatalog,
  submitReportSubmission,
} from "@/services/domains/reporting";

vi.mock("@/services/domains/reporting", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/services/domains/reporting")
  >();
  return {
    ...original,
    loadReportReasonCatalog: vi.fn(),
    submitReportSubmission: vi.fn(),
  };
});

const loadCatalogMock = vi.mocked(loadReportReasonCatalog);
const submitMock = vi.mocked(submitReportSubmission);

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        举报评论
      </Button>
      <ReportDialog
        target={
          open
            ? { targetType: "comment", objectId: 9, title: "被举报的评论" }
            : null
        }
        onOpenChange={setOpen}
      />
    </>
  );
}

describe("ReportDialog", () => {
  beforeEach(() => {
    loadCatalogMock.mockReset();
    submitMock.mockReset();
    loadCatalogMock.mockResolvedValue({
      version: 2,
      targetType: "comment",
      reasons: [
        { key: "spam", label: "垃圾广告", requiresDetail: false },
        { key: "other", label: "其他", requiresDetail: true },
      ],
    });
    submitMock.mockResolvedValue({
      id: 1,
      eventId: 2,
      targetType: "comment",
      targetId: "9",
      reasonKey: "other",
      reasonVersion: 2,
      status: 0,
      version: 1,
      supplemented: false,
      replayed: false,
      createdAt: "2026-08-27T08:00:00Z",
    });
  });

  it("uses the server catalog and only requests detail when required", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "举报评论" }));
    expect(await screen.findByRole("option", { name: "垃圾广告" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "补充说明" })).toBeNull();

    await user.selectOptions(screen.getByLabelText("原因"), "other");
    const detail = screen.getByRole("textbox", { name: /补充说明/ });
    await user.type(detail, "需要核查");
    await user.click(screen.getByRole("button", { name: "提交举报" }));

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "comment",
        objectId: 9,
        reasonKey: "other",
        reasonVersion: 2,
        content: "需要核查",
        idempotencyKey: expect.any(String),
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "举报" })).toBeNull(),
    );
  });

  it("does not offer a local fallback when the catalog fails", async () => {
    loadCatalogMock.mockRejectedValueOnce(new Error("目录暂不可用。"));
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "举报评论" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "举报原因加载失败。",
    );
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "提交举报" })
        .disabled,
    ).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsModal from "./SettingsModal";

afterEach(() => {
  localStorage.clear();
});

describe("SettingsModal", () => {
  it("gönüllü adını API anahtarından bağımsız kaydeder", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();

    render(
      <SettingsModal isOpen onClose={vi.fn()} onSaved={onSaved} account={null} />
    );

    await user.type(screen.getByLabelText(/^Gönüllü adı/), "Ece");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(localStorage.getItem("volunteer_name")).toBe("Ece");
    expect(localStorage.getItem("api_key")).toBeNull();
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("yeniden açıldığında kayıtlı gönüllü adını doldurur", () => {
    localStorage.setItem("volunteer_name", "Ece");
    const { rerender } = render(
      <SettingsModal isOpen={false} onClose={vi.fn()} onSaved={vi.fn()} account={null} />
    );

    rerender(<SettingsModal isOpen onClose={vi.fn()} onSaved={vi.fn()} account={null} />);

    expect(screen.getByLabelText(/^Gönüllü adı/)).toHaveValue("Ece");
  });

  it("yalnızca boşlukla kaydedildiğinde gönüllü adını kaldırır", async () => {
    localStorage.setItem("volunteer_name", "Ece");
    const user = userEvent.setup();

    render(<SettingsModal isOpen onClose={vi.fn()} onSaved={vi.fn()} account={null} />);

    await user.clear(screen.getByLabelText(/^Gönüllü adı/));
    await user.type(screen.getByLabelText(/^Gönüllü adı/), "   ");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(localStorage.getItem("volunteer_name")).toBeNull();
  });
});

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MAX_ID_LENGTH, MAX_ADD_IDS } from "@million/shared";
import { ADD_REFRESH_MS } from "../constants";
import { addIds } from "../api";

export function AddItemsForm() {
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);
  const client = useQueryClient();
  async function add(event: FormEvent) {
    event.preventDefault();
    const values = [
      ...new Set(
        custom
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    if (
      !values.length ||
      values.length > MAX_ADD_IDS ||
      values.some((value) => value.length > MAX_ID_LENGTH)
    ) {
      setMessage(
        "Введите от 1 до 100 ID, до 128 символов каждый, по одному на строку.",
      );
      return;
    }
    setAdding(true);
    try {
      const result = await addIds(values);
      setCustom("");
      setMessage(
        result.status === "duplicate"
          ? "Элементы уже добавлены или добавляются."
          : "Добавление в течение 10 секунд.",
      );
      window.setTimeout(
        () =>
          void client.invalidateQueries(
            { queryKey: ["items"] },
            { cancelRefetch: false },
          ),
        ADD_REFRESH_MS,
      );
    } catch {
      setMessage("Не удалось добавить элементы. Повторите попытку.");
    } finally {
      setAdding(false);
    }
  }
  return (
    <form className="add-form" onSubmit={add}>
      <label>
        <span className="sr-only">Новые ID</span>
        <textarea
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder="Новый ID — по одному на строку"
          rows={2}
        />
      </label>
      <button disabled={adding}>Добавить</button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

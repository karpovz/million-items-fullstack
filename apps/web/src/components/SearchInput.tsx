import { MAX_ID_LENGTH } from "@million/shared";

type Props = {
  title: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

export function SearchInput({ title, value, disabled, onChange }: Props) {
  return (
    <label className="search">
      <span className="sr-only">Поиск по ID: {title.toLowerCase()}</span>
      <input
        disabled={disabled}
        type="search"
        role="searchbox"
        value={value}
        maxLength={MAX_ID_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Поиск по ID"
      />
    </label>
  );
}

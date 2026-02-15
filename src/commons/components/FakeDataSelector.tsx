import React from "react";
import type { FakeDataType } from "../types";
import { Select } from "./ui/Select";

interface FakeDataSelectorProps {
  value?: FakeDataType;
  onChange: (value: FakeDataType) => void;
  disabled?: boolean;
}

export const FakeDataSelector: React.FC<FakeDataSelectorProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const options = [
    { value: "name", label: "Nombre Completo" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Teléfono" },
    { value: "address", label: "Dirección" },
    { value: "company", label: "Empresa" },
    { value: "date", label: "Fecha" },
    { value: "lorem", label: "Texto Lorem Ipsum" },
  ];

  return (
    <Select
      value={value || "name"}
      onChange={(val) => onChange(val as FakeDataType)}
      options={options}
      className={disabled ? "opacity-50 pointer-events-none" : ""}
      fullWidth
    />
  );
};

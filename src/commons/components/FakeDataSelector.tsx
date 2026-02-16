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
    { value: "firstName", label: "Nombre" },
    { value: "lastName", label: "Apellido" },
    { value: "email", label: "Email" },
    { value: "username", label: "Usuario" },
    { value: "password", label: "Password" },
    { value: "phone", label: "Teléfono" },
    { value: "address", label: "Dirección" },
    { value: "city", label: "Ciudad" },
    { value: "state", label: "Estado/Provincia" },
    { value: "zipCode", label: "Código Postal" },
    { value: "country", label: "País" },
    { value: "company", label: "Empresa" },
    { value: "jobTitle", label: "Cargo" },
    { value: "url", label: "URL" },
    { value: "date", label: "Fecha" },
    { value: "time", label: "Hora" },
    { value: "datetime", label: "Fecha y Hora" },
    { value: "number", label: "Número" },
    { value: "price", label: "Precio" },
    { value: "uuid", label: "UUID" },
    { value: "color", label: "Color Hex" },
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

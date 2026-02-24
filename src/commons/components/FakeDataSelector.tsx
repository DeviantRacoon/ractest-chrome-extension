import React from "react";
import { useI18n } from "../i18n";
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
  const { t } = useI18n();
  const options = [
    { value: "name", label: t("fakeData.option.name") },
    { value: "firstName", label: t("fakeData.option.firstName") },
    { value: "lastName", label: t("fakeData.option.lastName") },
    { value: "email", label: t("fakeData.option.email") },
    { value: "username", label: t("fakeData.option.username") },
    { value: "password", label: t("fakeData.option.password") },
    { value: "phone", label: t("fakeData.option.phone") },
    { value: "address", label: t("fakeData.option.address") },
    { value: "city", label: t("fakeData.option.city") },
    { value: "state", label: t("fakeData.option.state") },
    { value: "zipCode", label: t("fakeData.option.zipCode") },
    { value: "country", label: t("fakeData.option.country") },
    { value: "company", label: t("fakeData.option.company") },
    { value: "jobTitle", label: t("fakeData.option.jobTitle") },
    { value: "url", label: t("fakeData.option.url") },
    { value: "date", label: t("fakeData.option.date") },
    { value: "time", label: t("fakeData.option.time") },
    { value: "datetime", label: t("fakeData.option.datetime") },
    { value: "number", label: t("fakeData.option.number") },
    { value: "price", label: t("fakeData.option.price") },
    { value: "uuid", label: t("fakeData.option.uuid") },
    { value: "color", label: t("fakeData.option.color") },
    { value: "lorem", label: t("fakeData.option.lorem") },
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

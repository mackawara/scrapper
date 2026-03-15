"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import FilterListIcon from "@mui/icons-material/FilterList";

export interface Filters {
  endAfter: string;
  endBefore: string;
  minPrice: string;
  maxPrice: string;
}

export const EMPTY_FILTERS: Filters = {
  endAfter: "",
  endBefore: "",
  minPrice: "",
  maxPrice: "",
};

interface FilterPanelProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export default function FilterPanel({ filters, onChange }: FilterPanelProps) {
  const [local, setLocal] = useState<Filters>(filters);

  const hasFilters = Object.values(local).some((v) => v !== "");

  function apply() {
    onChange(local);
  }

  function clear() {
    setLocal(EMPTY_FILTERS);
    onChange(EMPTY_FILTERS);
  }

  function update(key: keyof Filters, value: string) {
    setLocal((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Box px={2} pb={1}>
      <Stack direction="row" alignItems="center" spacing={1} mb={1}>
        <FilterListIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        <Typography variant="overline" color="text.secondary">
          Filters
        </Typography>
      </Stack>

      <Typography variant="caption" color="text.secondary" mb={0.5} display="block">
        End Date
      </Typography>
      <Stack spacing={1} mb={1.5}>
        <TextField
          type="date"
          size="small"
          label="From"
          value={local.endAfter}
          onChange={(e) => update("endAfter", e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />
        <TextField
          type="date"
          size="small"
          label="To"
          value={local.endBefore}
          onChange={(e) => update("endBefore", e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />
      </Stack>

      <Typography variant="caption" color="text.secondary" mb={0.5} display="block">
        Price (USD)
      </Typography>
      <Stack direction="row" spacing={1} mb={1.5}>
        <TextField
          type="number"
          size="small"
          label="Min"
          value={local.minPrice}
          onChange={(e) => update("minPrice", e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0 } }}
          fullWidth
        />
        <TextField
          type="number"
          size="small"
          label="Max"
          value={local.maxPrice}
          onChange={(e) => update("maxPrice", e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0 } }}
          fullWidth
        />
      </Stack>

      <Stack direction="row" spacing={1}>
        <Button size="small" variant="contained" onClick={apply} fullWidth>
          Apply
        </Button>
        {hasFilters && (
          <Button size="small" variant="outlined" onClick={clear}>
            Clear
          </Button>
        )}
      </Stack>
      <Divider sx={{ mt: 2 }} />
    </Box>
  );
}

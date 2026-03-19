"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import FilterListIcon from "@mui/icons-material/FilterList";
import SortIcon from "@mui/icons-material/Sort";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";

export interface Filters {
  endAfter: string;
  endBefore: string;
  minPrice: string;
  maxPrice: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

export const EMPTY_FILTERS: Filters = {
  endAfter: "",
  endBefore: "",
  minPrice: "",
  maxPrice: "",
  sortBy: "auctionEndTime",
  sortOrder: "asc",
};

interface FilterPanelProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

const SORT_OPTIONS = [
  { value: "auctionEndTime", label: "Closing Date" },
  { value: "currentPrice", label: "Current Price" },
  { value: "title", label: "Title" },
  { value: "lotNumber", label: "Lot Number" },
];

export default function FilterPanel({ filters, onChange }: FilterPanelProps) {
  const [local, setLocal] = useState<Filters>(filters);

  const hasActiveFilters =
    local.endAfter !== "" ||
    local.endBefore !== "" ||
    local.minPrice !== "" ||
    local.maxPrice !== "" ||
    local.sortBy !== EMPTY_FILTERS.sortBy ||
    local.sortOrder !== EMPTY_FILTERS.sortOrder;

  function apply() {
    onChange(local);
  }

  function clear() {
    setLocal(EMPTY_FILTERS);
    onChange(EMPTY_FILTERS);
  }

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
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

      {/* Sort */}
      <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
        <SortIcon sx={{ fontSize: 16, color: "text.secondary" }} />
        <Typography variant="caption" color="text.secondary">
          Sort by
        </Typography>
      </Stack>
      <Stack spacing={1} mb={1.5}>
        <Select
          size="small"
          value={local.sortBy}
          onChange={(e) => update("sortBy", e.target.value)}
          fullWidth
        >
          {SORT_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </Select>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={local.sortOrder}
          onChange={(_e, val) => val && update("sortOrder", val as "asc" | "desc")}
          fullWidth
        >
          <ToggleButton value="asc" sx={{ flex: 1, gap: 0.5 }}>
            <ArrowUpwardIcon sx={{ fontSize: 14 }} />
            Asc
          </ToggleButton>
          <ToggleButton value="desc" sx={{ flex: 1, gap: 0.5 }}>
            <ArrowDownwardIcon sx={{ fontSize: 14 }} />
            Desc
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Divider sx={{ mb: 1.5 }} />

      {/* End date range */}
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

      {/* Price range */}
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
        {hasActiveFilters && (
          <Button size="small" variant="outlined" onClick={clear}>
            Clear
          </Button>
        )}
      </Stack>
      <Divider sx={{ mt: 2 }} />
    </Box>
  );
}

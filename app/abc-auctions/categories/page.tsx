"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CategoryIcon from "@mui/icons-material/Category";
import GridViewIcon from "@mui/icons-material/GridView";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useRouter } from "next/navigation";
import ProjectShell, { NavItem } from "@/components/ProjectShell";

interface CategoryItem {
  name: string;
  count: number;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Browse", href: "/abc-auctions", icon: <GridViewIcon fontSize="small" /> },
  { label: "Categories", href: "/abc-auctions/categories", icon: <CategoryIcon fontSize="small" /> },
  { label: "Watch List", href: "/abc-auctions/watchlist", icon: <VisibilityIcon fontSize="small" /> },
];

export default function CategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/abc-auctions/categories");
      const data = await res.json();
      setCategories(data.categories ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  function browseCategory(name: string) {
    router.push(`/abc-auctions?category=${encodeURIComponent(name)}`);
  }

  const totalLots = categories.reduce((sum, c) => sum + c.count, 0);

  return (
    <ProjectShell title="ABC Auctions" navItems={NAV_ITEMS}>
      <Stack direction="row" alignItems="center" spacing={1.5} mb={3}>
        <CategoryIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>
          Categories
        </Typography>
        {!loading && (
          <Typography variant="body2" color="text.secondary">
            {categories.length} categories · {totalLots} lots
          </Typography>
        )}
      </Stack>

      <Grid container spacing={2}>
        {loading
          ? Array.from({ length: 12 }).map((_, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <Skeleton variant="rounded" height={120} />
              </Grid>
            ))
          : categories.map(({ name, count }) => (
              <Grid key={name} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <Card variant="outlined" sx={{ height: "100%" }}>
                  <CardActionArea
                    onClick={() => browseCategory(name)}
                    sx={{ height: "100%", p: 0 }}
                  >
                    <CardContent>
                      <Stack spacing={1.5}>
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 2,
                            bgcolor: "secondary.light",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <CategoryIcon sx={{ color: "primary.dark", fontSize: 22 }} />
                        </Box>
                        <Typography variant="subtitle2" fontWeight={600} noWrap>
                          {name}
                        </Typography>
                        <Chip
                          label={`${count} lot${count !== 1 ? "s" : ""}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ alignSelf: "flex-start" }}
                        />
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
      </Grid>

      {!loading && categories.length === 0 && (
        <Box textAlign="center" mt={8}>
          <CategoryIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No categories found
          </Typography>
          <Typography variant="body2" color="text.disabled" mb={3}>
            Scrape products first to populate categories.
          </Typography>
          <Button variant="contained" href="/abc-auctions">
            Go to Browse
          </Button>
        </Box>
      )}
    </ProjectShell>
  );
}

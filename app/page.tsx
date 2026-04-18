"use client";

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import GavelIcon from "@mui/icons-material/Gavel";
import Link from "next/link";

const PROJECTS = [
  {
    name: "ABC Auctions",
    description:
      "Scrape and auto-bid on ABC Auctions. Browse live lots, set bid limits, and monitor auctions in real time.",
    href: "/abc-auctions",
    icon: <GavelIcon sx={{ fontSize: 36, color: "#7B1FA2" }} />,
    tag: "Live",
  },
];

export default function HomePage() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="static" elevation={0} sx={{ bgcolor: "primary.dark" }}>
        <Toolbar>
          <Typography variant="h6" fontWeight={700} color="white" letterSpacing={0.5}>
            Scrapper
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ maxWidth: 900, mx: "auto", px: 3, py: 7 }}>
        <Typography variant="h4" fontWeight={700} mb={1}>
          Projects
        </Typography>
        <Typography variant="body1" color="text.secondary" mb={5}>
          Select a project to browse and manage scraped data.
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 3,
          }}
        >
          {PROJECTS.map((project) => (
            <Card
              key={project.href}
              elevation={2}
              sx={{ transition: "box-shadow 0.2s", "&:hover": { boxShadow: 6 } }}
            >
              <CardActionArea component={Link} href={project.href}>
                <CardContent sx={{ p: 3 }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      mb: 2,
                    }}
                  >
                    {project.icon}
                    <Chip label={project.tag} size="small" color="success" />
                  </Box>
                  <Typography variant="h6" fontWeight={600} mb={1}>
                    {project.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {project.description}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

"use client";

import { Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import GitHubIcon from "@mui/icons-material/GitHub";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/abc-auctions";
  const error = searchParams.get("error");

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      }}
    >
      <Card elevation={8} sx={{ maxWidth: 420, width: "100%", mx: 2, borderRadius: 3 }}>
        <CardContent sx={{ p: 5 }}>
          <Typography variant="h4" fontWeight={800} textAlign="center" gutterBottom>
            Scrapper
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center" mb={4}>
            Sign in to access the auction scraper
          </Typography>

          {error === "AccessDenied" && (
            <Alert severity="error" sx={{ mb: 3 }}>
              Your GitHub account is not on the approved list.
            </Alert>
          )}

          <Button
            variant="contained"
            fullWidth
            startIcon={<GitHubIcon />}
            onClick={() => signIn("github", { callbackUrl })}
            sx={{
              py: 1.5,
              borderRadius: 2,
              textTransform: "none",
              fontWeight: 600,
              fontSize: 15,
              bgcolor: "#24292e",
              "&:hover": { bgcolor: "#1b1f23" },
            }}
          >
            Sign in with GitHub
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

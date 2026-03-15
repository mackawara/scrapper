import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import GitHubIcon from "@mui/icons-material/GitHub";
import { signIn } from "@/auth";

export default function SignInPage() {
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
      <Card
        elevation={8}
        sx={{
          maxWidth: 400,
          width: "100%",
          mx: 2,
          borderRadius: 3,
          overflow: "visible",
        }}
      >
        <CardContent sx={{ p: 5, textAlign: "center" }}>
          <Typography variant="h4" fontWeight={800} gutterBottom>
            Scrapper
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={4}>
            Sign in to access the auction scraper
          </Typography>

          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/abc-auctions" });
            }}
          >
            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              startIcon={<GitHubIcon />}
              sx={{
                py: 1.5,
                bgcolor: "#24292e",
                "&:hover": { bgcolor: "#1b1f23" },
                borderRadius: 2,
                textTransform: "none",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Sign in with GitHub
            </Button>
          </form>

          <Stack direction="row" justifyContent="center" mt={3}>
            <Typography variant="caption" color="text.disabled">
              Powered by NextAuth.js
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

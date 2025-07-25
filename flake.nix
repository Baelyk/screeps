{
  description = "screeps-launcher flake";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.nixpkgs-with-node-12.url = "github:NixOS/nixpkgs/f597e7e9fcf37d8ed14a12835ede0a7d362314bd";
  inputs.flake-utils.url = "github:numtide/flake-utils";
  inputs.gomod2nix.url = "github:nix-community/gomod2nix";
  inputs.gomod2nix.inputs.nixpkgs.follows = "nixpkgs";
  inputs.gomod2nix.inputs.flake-utils.follows = "flake-utils";
  inputs.fenix.url = "github:nix-community/fenix";
  inputs.fenix.inputs.nixpkgs.follows = "nixpkgs";

  outputs = {
    self,
    nixpkgs,
    nixpkgs-with-node-12,
    fenix,
    flake-utils,
    gomod2nix,
  }: (flake-utils.lib.eachDefaultSystem (system: let
    rust_toolchain = with fenix.packages.${system};
      combine [
        latest.toolchain
        targets.wasm32-unknown-unknown.latest.rust-std
      ];

    pkgs = import nixpkgs {
      inherit system;
      overlays = [gomod2nix.overlays.default];
      config = {
        permittedInsecurePackages = [
          "python-2.7.18.8" # Screeps needs Python v2.7.18.8
        ];
      };
    };
    # Screeps needs NodeJS v12.22.12
    nodejs-12_22_12 =
      (import nixpkgs-with-node-12 {
        inherit system;
        config = {
          permittedInsecurePackages = [
            "nodejs-12.22.12"
          ];
        };
      }).nodejs-12_x;
    # Configure screeps-launcher to use nixpkgs instead of downlaoding node and yarn
    paths_go = ''
      // +build !windows
      package install
      var NodePath = "${nodejs-12_22_12}/bin/node"
      var NpmPath = "${nodejs-12_22_12}/bin/npm"
      var YarnPath = "${pkgs.yarn}/bin/yarn"
    '';

    buildInputs = with pkgs; [gnumake gcc9 nodejs-12_22_12 python2];

    screeps-launcher-src = pkgs.fetchFromGitHub {
      owner = "screepers";
      repo = "screeps-launcher";
      rev = "701e8af6867854cb5e3efd5459fa9cf9febcc280";
      hash = "sha256-0eze/q18Bf2mw5NKporEUCq2+cUY4I0XmEOPcdklrh8=";
    };

    screeps-launcher = pkgs.buildGoApplication {
      pname = "screeps-launcher";
      version = "1.16.2";
      src = screeps-launcher-src;
      pwd = screeps-launcher-src;
      subPackages = ["cmd/screeps-launcher"];

      nativeBuildInputs = with pkgs; [makeWrapper];

      preBuild = ''
        rm install/paths.go
        echo '${paths_go}' > install/paths.go
      '';

      postInstall = ''
        wrapProgram $out/bin/screeps-launcher \
          --prefix PATH : ${pkgs.lib.makeBinPath buildInputs}
      '';
    };
  in {
    packages.server = pkgs.writeShellApplication {
      name = "screeps-server";
      text = ''
        mkdir -p server/data
        cp server/config.yml server/data/
        cd server/data
        key=$(cat /run/secrets/steam-api-key)
        STEAM_KEY=$key ${screeps-launcher}/bin/screeps-launcher "$@"
      '';
    };
    devShells.default = pkgs.mkShell {
      packages = with pkgs; [
        nodejs
        rust_toolchain
        openssl
        pkg-config
        llvmPackages.bintools
        typescript-language-server
        biome
      ];

      LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [pkgs.openssl];
      CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_LINKER = "lld";

      shellHook = ''
        echo node $(node --version)
        echo $(cargo --version)
      '';
    };
  }));
}

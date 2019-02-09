#!/usr/local/bin/perl -w    
use File::Spec 'join';
use JSON 'decode_json';

open(my $inFile,  "<Dockerfile") || die "Unable to open './Dockerfile'.";   

print <<'END';
{
  "pnpmVersion": "2.15.1",
  "rushVersion": "5.5.2",
  "nodeSupportedVersionRange": ">=8.0.0",
  "projectFolderMinDepth": 1,
  "projectFolderMaxDepth": 999,
  "projects": [
END

my $isFirst = 1;
while (<$inFile>) {
    if ($_ =~ /COPY (packages.*)package\*.json/) {
        my $packagePath = $1;
        my $packageFile = join("", $packagePath, "package.json");
        open my $jsonText, '<', $packageFile or die "error opening $packageFile: $!";
        my $data = decode_json do { local $/; <$jsonText> };
        my $packageName = $data->{name};

        if ($isFirst) {
            $isFirst = 0;
        } else {
            print ",\n";
        }

        my $entry = <<"END";
    {
      "packageName": "$packageName",
      "projectFolder": "$packagePath"
    }
END
        
        $entry =~ s/\n$//m;

        print $entry;
    }
}

print <<'END';

  ]
}
END
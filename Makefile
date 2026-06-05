.PHONY: help package clean

# Target to print help
help:
	@echo "Muchallms Extension Build Tool"
	@echo "------------------------------"
	@echo "Available targets:"
	@echo "  make package  - Packages the extension into 'muchallms.zip' for Chrome Web Store"
	@echo "  make clean    - Deletes the generated 'muchallms.zip' file"

# Package the extension
package: clean
	@echo "Packaging extension..."
	@cd extension && zip -r ../muchallms.zip . -x "*.DS_Store" -x "__MACOSX"
	@echo "Created muchallms.zip successfully!"

# Clean up build artifacts
clean:
	@rm -f muchallms.zip

<template>
  <MainContentOverlay>
    <div class="bg-black/30 inset-0 h-full w-full flex flex-wrap justify-center items-center z-100 relative">
      <div class="bg-white p-4 rounded-lg shadow-xl max-w-md mb-30 z-105">
        <slot />
      </div>
    </div>
  </MainContentOverlay>
</template>

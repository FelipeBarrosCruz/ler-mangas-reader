import axios from "axios";
import { join } from "path";
import { finished } from "stream/promises";
import { createWriteStream } from "fs";
import { mkdir, stat, rm } from "fs/promises";
import { setTimeout } from "timers/promises";
import "colors";

const CONFIG = {
  MANGAS_DIR: join(process.cwd(), "mangas"),
  BASE_URL:
    "https://img.lermanga.org/S/{{MANGA}}/capitulo-{{CHAPTER}}/{{PICTURE}}.jpg",
  PICTURE_DEFAULT_EXT: "jpg",
};

class Downloader {
  constructor(manga) {
    this.manga = manga;
    this.mangaAsStr = `${this.manga}`.inverse.underline;
    this.mangaDir = join(CONFIG.MANGAS_DIR, this.manga);
    this.chapters = {};
  }

  async fileExists(filepath) {
    try {
      await stat(filepath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async createDirIfNotExists(directory) {
    try {
      const dir = await stat(directory);

      if (!dir.isDirectory()) {
        await rm(directory);
        throw new Error("Recreate as directory");
      }
    } catch (error) {
      await mkdir(directory, { recursive: true });
    }
  }

  /**
   *
   * @param {number} chapter
   * @param {number} picture
   * @param {string} chapterDir
   * @returns {Promise}
   * @throws {Error}
   */
  async downloadPicture(chapter, picture, chapterDir) {
    const filepath = join(
      chapterDir,
      `${picture}.${CONFIG.PICTURE_DEFAULT_EXT}`
    );

    if (await this.fileExists(filepath)) {
      console.log(
        "Skip download %s picture from %s chapter, because already exists"
          .underline,
        `${picture}`.green,
        `${chapter}`.green
      );
      return false;
    }

    const url = CONFIG.BASE_URL.replace("{{MANGA}}", this.manga)
      .replace("{{CHAPTER}}", chapter)
      .replace("{{PICTURE}}", picture);

    return new Promise((resolve) => {
      axios
        .request({
          url,
          method: "GET",
          responseType: "stream",
        })
        .then(async (response) => {
          const writer = createWriteStream(filepath);
          response.data.pipe(writer);
          return finished(writer);
        })
        .then(() => {
          console.log(
            "Downloaded %s picture from %s chapter".underline,
            `${picture}`.green,
            `${chapter}`.green
          );
          resolve(false);
        })
        .catch((error) => {
          if (error.response.status === 404) {
            return resolve(true);
          }
          throw error;
        });
    });
  }

  async checkChapterNotExists(chapter) {
    const url = CONFIG.BASE_URL.replace("{{MANGA}}", this.manga)
      .replace("{{CHAPTER}}", chapter)
      .replace("{{PICTURE}}", 1);

    return new Promise((resolve) => {
      axios
        .request({
          url,
          method: "HEAD",
        })
        .then(() => resolve(false))
        .catch((error) => {
          if (error.response.status === 404) {
            return resolve(true);
          }
          throw error;
        });
    });
  }

  /**
   *
   * @param {number} chapter
   */
  async downloadChapter(chapter) {
    const chapterDir = join(this.mangaDir, chapter.toString());
    await this.createDirIfNotExists(chapterDir);

    let page = 1;
    let done = false;

    while (!done) {
      await setTimeout(() => {}, Math.random() * 1000);
      done = await this.downloadPicture(chapter, page, chapterDir);
      page++;
    }
    return { pages: page, chapterDir };
  }

  async downloadManga() {
    let chapter = 0;
    let done = false;

    while (!done) {
      await setTimeout(() => {}, Math.random() * 1000);
      done = await this.checkChapterNotExists(chapter);

      if (!done) {
        const { pages, chapterDir } = await this.downloadChapter(chapter);
        this.chapters[chapter] = { pages, chapterDir };
        chapter++;
      }
    }
  }

  async run() {
    console.log("Initialized download for %s manga", this.mangaAsStr);
    await this.createDirIfNotExists(this.mangaDir);
    await this.downloadManga();
    return { manga: this.mangaAsStr, chapters: this.chapters };
  }
}

(async () => {
  const manga = process.argv[2];
  const downloader = new Downloader(manga);
  return downloader.run();
})()
  .then(({ manga, chapters }) => {
    console.log("Finished %s manga", manga);
    const chapterKeys = Object.keys(chapters);
    console.log("%s chapters in %s manga", chapterKeys.length);
    chapterKeys.map((key) => {
      const chapter = chapters[key];
      console.log("%s chapter with %s pages", chapter.pages);
      console.log("%s chapter read in %s directory", chapter.chapterDir);
    });
  })
  .catch(console.error);
